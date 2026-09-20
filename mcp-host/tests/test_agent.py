from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai import types
from mcp import types as mcp_types

from agent import FALLBACK_REPLY, Agent
from client import ToolError

PHONE = "5491155550000"

TOOLS = [
    mcp_types.Tool(
        name="get_available_times",
        description="times",
        input_schema={"type": "object", "properties": {"date": {"type": "string"}}},
    ),
    mcp_types.Tool(
        name="cancel_booking",
        description="cancel",
        input_schema={
            "type": "object",
            "properties": {"bookingId": {"type": "integer"}, "phoneNumber": {"type": "string"}},
            "required": ["bookingId", "phoneNumber"],
        },
    ),
    mcp_types.Tool(
        name="join_match",
        description="join",
        input_schema={"type": "object", "properties": {"matchId": {"type": "integer"}, "playerId": {"type": "integer"}}},
    ),
]


def reply(text):
    return types.GenerateContentResponse(
        candidates=[types.Candidate(content=types.Content(role="model", parts=[types.Part(text=text)]))]
    )


def tool_call(*calls):
    parts = [types.Part(function_call=types.FunctionCall(name=name, args=args)) for name, args in calls]
    return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role="model", parts=parts))])


@pytest.fixture
def mcp():
    return SimpleNamespace(
        list_tools=AsyncMock(return_value=TOOLS),
        call_tool=AsyncMock(return_value={"times": ["09:00"]}),
    )


@pytest.fixture
def llm():
    generate = AsyncMock()
    return SimpleNamespace(generate=generate, aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))


@pytest.fixture
def agent(mcp, llm):
    return Agent(mcp, llm, "test-model", max_steps=4)


def function_responses(history):
    return [
        p.function_response
        for content in history
        for p in (content.parts or [])
        if p.function_response is not None
    ]


async def test_answers_without_tools(agent, llm):
    llm.generate.side_effect = [reply("¡Hola! ¿En qué te ayudo?")]
    history = []

    assert await agent.respond(history, "hola", PHONE) == "¡Hola! ¿En qué te ayudo?"
    assert [c.role for c in history] == ["user", "model"]


async def test_sends_model_history_and_config_to_gemini(agent, llm):
    llm.generate.side_effect = [reply("ok")]

    await agent.respond([], "hola", PHONE, "Fran")

    kwargs = llm.generate.await_args.kwargs
    assert kwargs["model"] == "test-model"
    assert kwargs["contents"][0].parts[0].text == "hola"
    assert 'perfil de WhatsApp es "Fran"' in kwargs["config"].system_instruction
    assert kwargs["config"].automatic_function_calling.disable is True


async def test_only_visible_tools_are_declared_and_without_phone(agent, llm):
    llm.generate.side_effect = [reply("ok")]

    await agent.respond([], "hola", PHONE)

    declared = llm.generate.await_args.kwargs["config"].tools[0].function_declarations
    assert [d.name for d in declared] == ["get_available_times", "cancel_booking"]
    assert "phoneNumber" not in declared[1].parameters_json_schema["properties"]


async def test_runs_the_tool_and_feeds_the_result_back(agent, llm, mcp):
    llm.generate.side_effect = [
        tool_call(("get_available_times", {"date": "2026-09-25"})),
        reply("Hay lugar a las 09:00"),
    ]
    history = []

    text = await agent.respond(history, "¿qué hay el viernes?", PHONE)

    assert text == "Hay lugar a las 09:00"
    mcp.call_tool.assert_awaited_once_with("get_available_times", {"date": "2026-09-25"})
    (response,) = function_responses(history)
    assert response.name == "get_available_times"
    assert response.response == {"result": {"times": ["09:00"]}}
    assert [c.role for c in history] == ["user", "model", "user", "model"]


async def test_injects_the_customers_phone_and_ignores_the_models(agent, llm, mcp):
    llm.generate.side_effect = [
        tool_call(("cancel_booking", {"bookingId": 7, "phoneNumber": "someone-else"})),
        reply("Listo"),
    ]

    await agent.respond([], "cancelá la 7", PHONE)

    mcp.call_tool.assert_awaited_once_with("cancel_booking", {"bookingId": 7, "phoneNumber": PHONE})


async def test_runs_parallel_calls_and_answers_each(agent, llm, mcp):
    llm.generate.side_effect = [
        tool_call(("get_available_times", {"date": "2026-09-25"}), ("get_available_times", {"date": "2026-09-26"})),
        reply("ok"),
    ]
    history = []

    await agent.respond(history, "viernes y sábado", PHONE)

    assert mcp.call_tool.await_count == 2
    assert len(function_responses(history)) == 2


async def test_tool_errors_are_returned_to_the_model(agent, llm, mcp):
    mcp.call_tool.side_effect = ToolError("Booking not found for this phone number")
    llm.generate.side_effect = [tool_call(("cancel_booking", {"bookingId": 9})), reply("No encontré esa reserva")]
    history = []

    assert await agent.respond(history, "cancelá la 9", PHONE) == "No encontré esa reserva"
    assert function_responses(history)[0].response == {"error": "Booking not found for this phone number"}


async def test_unexpected_tool_failures_do_not_leak_details(agent, llm, mcp):
    mcp.call_tool.side_effect = ConnectionError("postgres://user:secret@host")
    llm.generate.side_effect = [tool_call(("get_available_times", {})), reply("Hubo un problema")]
    history = []

    await agent.respond(history, "hola", PHONE)

    assert "secret" not in str(function_responses(history)[0].response)


async def test_unknown_and_hidden_tools_are_not_executed(agent, llm, mcp):
    llm.generate.side_effect = [
        tool_call(("join_match", {"matchId": 1, "playerId": 99}), ("drop_tables", {})),
        reply("No puedo"),
    ]
    history = []

    await agent.respond(history, "anotame", PHONE)

    mcp.call_tool.assert_not_awaited()
    assert all("error" in r.response for r in function_responses(history))


async def test_gives_up_after_max_steps(agent, llm, mcp):
    llm.generate.side_effect = lambda **_: tool_call(("get_available_times", {}))

    assert await agent.respond([], "hola", PHONE) == FALLBACK_REPLY
    assert llm.generate.await_count == 4


async def test_falls_back_when_gemini_returns_no_candidates(agent, llm):
    llm.generate.side_effect = [types.GenerateContentResponse(candidates=[])]

    assert await agent.respond([], "hola", PHONE) == FALLBACK_REPLY


async def test_falls_back_on_an_empty_answer(agent, llm):
    llm.generate.side_effect = [reply("   ")]

    assert await agent.respond([], "hola", PHONE) == FALLBACK_REPLY


async def test_loads_tools_once_and_keeps_history_across_messages(agent, llm, mcp):
    llm.generate.side_effect = [reply("uno"), reply("dos")]
    history = []

    await agent.respond(history, "a", PHONE)
    await agent.respond(history, "b", PHONE)

    mcp.list_tools.assert_awaited_once()
    assert len(llm.generate.await_args.kwargs["contents"]) == 4
