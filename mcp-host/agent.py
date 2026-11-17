import asyncio
import json
import logging
from typing import Any

import httpx
from google import genai
from google.genai import errors, types
from mcp import types as mcp_types

from client import ToolError, mcp_client
from config import conf
from prompts import build_system_prompt
from tools import inject_phone, to_anthropic_tools, to_function_declarations

logger = logging.getLogger(__name__)

# Model <-> tool round trips allowed for one customer message.
MAX_STEPS = 8

FALLBACK_REPLY = "Perdón, no pude resolver eso ahora. ¿Podés intentar de nuevo en un rato?"


class Agent:
    """Runs Gemini's function-calling loop against the MCP server's tools.

    `history` is the conversation so far (a list of `types.Content`). It is updated in place,
    so the caller decides how to store it between messages.
    """

    def __init__(self, mcp: Any, llm: genai.Client, model: str, max_steps: int = MAX_STEPS) -> None:
        self._mcp = mcp
        self._llm = llm
        self._model = model
        self._max_steps = max_steps
        self._tools: dict[str, mcp_types.Tool] = {}
        self._declarations: list[types.FunctionDeclaration] = []

    async def load_tools(self) -> None:
        tools = await self._mcp.list_tools()
        self._tools = {t.name: t for t in tools}
        self._declarations = to_function_declarations(tools)

    async def respond(
        self,
        history: list[types.Content],
        text: str,
        phone: str,
        profile_name: str | None = None,
    ) -> str:
        """Answer one customer message; `phone` is the number the message came from."""
        if not self._tools:
            await self.load_tools()

        config = types.GenerateContentConfig(
            system_instruction=build_system_prompt(profile_name),
            tools=[types.Tool(function_declarations=self._declarations)],
            # We run the loop ourselves so every tool call goes through inject_phone.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        start = len(history)
        history.append(types.Content(role="user", parts=[types.Part(text=text)]))

        for _ in range(self._max_steps):
            try:
                response = await self._llm.aio.models.generate_content(
                    model=self._model, contents=history, config=config
                )
            except errors.APIError as e:
                # Overloaded model, rate limit, bad key... Drop this turn so the history stays consistent.
                logger.error("Gemini request failed: %s", e)
                del history[start:]
                return FALLBACK_REPLY
            if not response.candidates or response.candidates[0].content is None:
                logger.warning("Gemini returned no content (finish reason: %s)", _finish_reason(response))
                return FALLBACK_REPLY

            # Kept as returned: Gemini needs its own parts (thought signatures) echoed back.
            history.append(response.candidates[0].content)

            calls = response.function_calls
            if not calls:
                return (response.text or "").strip() or FALLBACK_REPLY

            results = await asyncio.gather(*(self._run_tool(call, phone) for call in calls))
            history.append(types.Content(role="user", parts=list(results)))

        logger.warning("Stopped after %s steps without a final answer", self._max_steps)
        return FALLBACK_REPLY

    async def _run_tool(self, call: types.FunctionCall, phone: str) -> types.Part:
        name = call.name or ""
        tool = self._tools.get(name)
        if tool is None:
            return _function_response(name, {"error": f"Unknown tool: {name}"})

        arguments = inject_phone(tool, dict(call.args or {}), phone)
        try:
            data = await self._mcp.call_tool(name, arguments)
        except ToolError as e:
            # A business error (slot taken, booking not found...): the model explains it to the customer.
            return _function_response(name, {"error": str(e)})
        except Exception:
            logger.exception("Tool %s failed", name)
            return _function_response(name, {"error": "The service is not available right now"})

        return _function_response(name, {"result": data})


def _function_response(name: str, response: dict[str, Any]) -> types.Part:
    return types.Part.from_function_response(name=name, response=response)


def _finish_reason(response: types.GenerateContentResponse) -> Any:
    return response.candidates[0].finish_reason if response.candidates else None


ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicAgent:
    """Runs Claude's tool-calling loop against the MCP server's tools via Anthropic Messages API."""

    def __init__(self, mcp: Any, api_key: str, model: str, max_steps: int = MAX_STEPS) -> None:
        self._mcp = mcp
        self._api_key = api_key
        self._model = model
        self._max_steps = max_steps
        self._tools: dict[str, mcp_types.Tool] = {}
        self._declarations: list[dict[str, Any]] = []

    async def load_tools(self) -> None:
        tools = await self._mcp.list_tools()
        self._tools = {t.name: t for t in tools}
        self._declarations = to_anthropic_tools(tools)

    async def respond(
        self,
        history: list[dict[str, Any]],
        text: str,
        phone: str,
        profile_name: str | None = None,
    ) -> str:
        if not self._tools:
            await self.load_tools()

        start = len(history)
        history.append({"role": "user", "content": text})

        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "anthropic-beta": "thinking-binding-controls-2026-08-01",
            "content-type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            for _ in range(self._max_steps):
                payload = {
                    "model": self._model,
                    "max_tokens": 1024,
                    "system": build_system_prompt(profile_name),
                    "tools": self._declarations,
                    "messages": history,
                }
                try:
                    res = await client.post(ANTHROPIC_MESSAGES_URL, headers=headers, json=payload)
                    if res.status_code >= 400:
                        logger.error("Claude API error %s: %s (model: %s)", res.status_code, res.text, self._model)
                    res.raise_for_status()
                    data = res.json()
                except Exception as e:
                    logger.error("Claude request failed: %s", e)
                    del history[start:]
                    return FALLBACK_REPLY

                content_blocks = data.get("content", [])
                stop_reason = data.get("stop_reason")

                conversation_blocks = [b for b in content_blocks if b.get("type") != "thinking"]
                history.append({"role": "assistant", "content": conversation_blocks})

                if stop_reason != "tool_use":
                    text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
                    return "".join(text_parts).strip() or FALLBACK_REPLY

                tool_results = []
                for block in content_blocks:
                    if block.get("type") == "tool_use":
                        name = block.get("name", "")
                        tool = self._tools.get(name)
                        if tool is None:
                            tool_res = {"error": f"Unknown tool: {name}"}
                        else:
                            arguments = inject_phone(tool, dict(block.get("input") or {}), phone)
                            try:
                                tool_res = await self._mcp.call_tool(name, arguments)
                            except ToolError as err:
                                tool_res = {"error": str(err)}
                            except Exception:
                                logger.exception("Tool %s failed", name)
                                tool_res = {"error": "The service is not available right now"}

                        content_str = json.dumps(tool_res, ensure_ascii=False) if not isinstance(tool_res, str) else tool_res
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.get("id"),
                            "content": content_str,
                        })

                history.append({"role": "user", "content": tool_results})

        logger.warning("Stopped after %s steps without a final answer", self._max_steps)
        return FALLBACK_REPLY


def build_agent() -> Agent | AnthropicAgent:
    if conf.ANTHROPIC_API_KEY:
        logger.info("Using Anthropic Claude model: %s", conf.ANTHROPIC_MODEL)
        return AnthropicAgent(mcp_client, conf.ANTHROPIC_API_KEY, conf.ANTHROPIC_MODEL)

    # Gemini answers 503 when the model is overloaded; the SDK retries transient errors with backoff.
    retry = types.HttpRetryOptions(attempts=5, initial_delay=1.0, max_delay=10.0, http_status_codes=[429, 500, 503, 504])
    llm = genai.Client(api_key=conf.GEMINI_API_KEY, http_options=types.HttpOptions(retry_options=retry))

    return Agent(mcp_client, llm, conf.GEMINI_MODEL)
