from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai import errors, types
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
        name="get_court_location",
        description="location",
        input_schema={
            "type": "object",
            "properties": {"courtId": {"type": "integer"}, "name": {"type": "string"}},
        },
    ),
    mcp_types.Tool(
        name="get_open_matches",
        description="matches",
        input_schema={"type": "object", "properties": {}},
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
    assert [d.name for d in declared] == ["get_available_times", "cancel_booking", "get_court_location"]
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
        tool_call(("get_open_matches", {}), ("drop_tables", {})),
        reply("No puedo"),
    ]
    history = []

    await agent.respond(history, "¿hay partidos abiertos?", PHONE)

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


def api_error(code=503):
    return errors.ServerError(code, {"error": {"code": code, "message": "high demand", "status": "UNAVAILABLE"}})


async def test_returns_the_fallback_when_gemini_is_unavailable(agent, llm):
    llm.generate.side_effect = api_error()

    assert await agent.respond([], "hola", PHONE) == FALLBACK_REPLY


async def test_a_failed_turn_is_removed_from_the_history(agent, llm, mcp):
    llm.generate.side_effect = [reply("uno"), tool_call(("get_available_times", {})), api_error(), reply("dos")]
    history = []

    await agent.respond(history, "a", PHONE)
    assert await agent.respond(history, "b", PHONE) == FALLBACK_REPLY
    assert len(history) == 2  # only the first, successful exchange

    assert await agent.respond(history, "c", PHONE) == "dos"
    assert [c.role for c in history] == ["user", "model", "user", "model"]


async def test_court_location_question_1_where_is_court_2(agent, llm, mcp):
    mcp.call_tool.return_value = {
        "court": {"id": 2, "number": 2, "name": "Cancha 2"},
        "clubName": "Quento Club",
        "address": "Cam. Centenario 8907, B1894 Villa Elisa, Buenos Aires",
        "city": "Villa Elisa",
        "coordinates": {"latitude": -34.8637264, "longitude": -58.0610566},
        "googleMapsUrl": "https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA",
    }
    llm.generate.side_effect = [
        tool_call(("get_court_location", {"name": "Cancha 2"})),
        reply("La Cancha 2 queda en Quento Club, Cam. Centenario 8907, Villa Elisa. Mapa: https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA"),
    ]
    history = []

    answer = await agent.respond(history, "¿dónde queda la cancha 2?", PHONE)

    mcp.call_tool.assert_awaited_once_with("get_court_location", {"name": "Cancha 2"})
    assert "https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA" in answer
    assert "Cam. Centenario 8907" in answer


async def test_court_location_question_2_how_to_get_to_court_1(agent, llm, mcp):
    mcp.call_tool.return_value = {
        "court": {"id": 1, "number": 1, "name": "Cancha 1"},
        "clubName": "Quento Club",
        "address": "Cam. Centenario 8907, B1894 Villa Elisa, Buenos Aires",
        "city": "Villa Elisa",
        "coordinates": {"latitude": -34.8637264, "longitude": -58.0610566},
        "googleMapsUrl": "https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA",
    }
    llm.generate.side_effect = [
        tool_call(("get_court_location", {"name": "1"})),
        reply("Para llegar a la cancha 1 podés seguir la ubicación en Google Maps: https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA (Cam. Centenario 8907)."),
    ]
    history = []

    answer = await agent.respond(history, "¿cómo llego a la cancha 1?", PHONE)

    mcp.call_tool.assert_awaited_once_with("get_court_location", {"name": "1"})
    assert "https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA" in answer


async def test_court_location_question_3_court_does_not_exist(agent, llm, mcp):
    mcp.call_tool.side_effect = ToolError("Court not found with the provided id or name")
    llm.generate.side_effect = [
        tool_call(("get_court_location", {"name": "Cancha 99"})),
        reply("No encontré la cancha 99 en el club. Tenemos canchas de la 1 a la 8."),
    ]
    history = []

    answer = await agent.respond(history, "¿dónde queda la cancha 99?", PHONE)

    mcp.call_tool.assert_awaited_once_with("get_court_location", {"name": "Cancha 99"})
    assert "No encontré la cancha 99" in answer
