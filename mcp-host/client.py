import asyncio
import json
import logging
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, types
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client

from config import conf

logger = logging.getLogger(__name__)


class ToolError(Exception):
    """The MCP server ran the tool and reported an error (e.g. slot already taken)."""


class McpClient:
    """Keeps one MCP session open and reuses it across tool calls.

    The connection is opened lazily (or explicitly with `connect`), and reopened once
    if a call fails because the transport dropped.
    """

    def __init__(self, url: str, api_key: str) -> None:
        self._url = url
        self._api_key = api_key
        self._stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        async with self._lock:
            await self._connect()

    async def close(self) -> None:
        async with self._lock:
            await self._close()

    async def list_tools(self) -> list[types.Tool]:
        result = await self._with_session(lambda session: session.list_tools())
        return result.tools

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Call a tool and return its result (parsed JSON when the tool returns JSON).

        Raises ToolError if the tool reported an error; any other exception means the
        transport failed.
        """
        result = await self._with_session(lambda session: session.call_tool(tool_name, arguments))
        return _unwrap(result)

    async def _connect(self) -> ClientSession:
        if self._session is not None:
            return self._session

        stack = AsyncExitStack()
        try:
            http_client = create_mcp_http_client(headers={"x-api-key": self._api_key})
            await stack.enter_async_context(http_client)
            read, write = await stack.enter_async_context(
                streamable_http_client(self._url, http_client=http_client)
            )
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
        except BaseException:
            await stack.aclose()
            raise

        self._stack, self._session = stack, session
        return session

    async def _close(self) -> None:
        stack, self._stack, self._session = self._stack, None, None
        if stack is not None:
            try:
                await stack.aclose()
            except Exception:
                logger.warning("Error closing MCP session", exc_info=True)

    async def _with_session(self, operation):
        # Calls run concurrently on the shared session; only (re)connecting is serialised.
        for attempt in (1, 2):
            async with self._lock:
                session = await self._connect()
            try:
                return await operation(session)
            except Exception:
                async with self._lock:
                    # Another call may already have replaced the broken session.
                    if self._session is session:
                        await self._close()
                if attempt == 2:
                    raise
                logger.warning("MCP call failed, reconnecting", exc_info=True)


def _unwrap(result: types.CallToolResult) -> Any:
    if result.structured_content is not None:
        data: Any = result.structured_content
    else:
        text = "\n".join(c.text for c in result.content if isinstance(c, types.TextContent))
        try:
            data = json.loads(text)
        except ValueError:
            data = text or None

    if result.is_error:
        raise ToolError(data if isinstance(data, str) else json.dumps(data))
    return data


mcp_client = McpClient(conf.MCP_SERVER_URL, conf.MCP_API_KEY)
