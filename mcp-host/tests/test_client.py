import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from mcp import types

import client
from client import McpClient, ToolError


def text_result(payload, is_error=False):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return types.CallToolResult(content=[types.TextContent(type="text", text=text)], is_error=is_error)


@pytest.fixture
def mcp(monkeypatch):
    """Replaces the HTTP client, transport and session; exposes the mocks to inspect them."""
    session = MagicMock()
    session.initialize = AsyncMock()
    session.call_tool = AsyncMock(return_value=text_result({"ok": True}))
    session.list_tools = AsyncMock(return_value=SimpleNamespace(tools=["tool-a", "tool-b"]))

    fake = SimpleNamespace(session=session, urls=[], headers=[], http_clients=[], opened=0, closed=0)

    class FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    def fake_http_client(headers=None, **kwargs):
        fake.headers.append(headers)
        return FakeHttpClient()

    @asynccontextmanager
    async def fake_transport(url, http_client=None):
        fake.urls.append(url)
        fake.http_clients.append(http_client)
        fake.opened += 1
        try:
            yield ("read-stream", "write-stream")
        finally:
            fake.closed += 1

    class FakeClientSession:
        def __init__(self, read, write):
            fake.streams = (read, write)

        async def __aenter__(self):
            return session

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(client, "create_mcp_http_client", fake_http_client)
    monkeypatch.setattr(client, "streamable_http_client", fake_transport)
    monkeypatch.setattr(client, "ClientSession", FakeClientSession)

    return fake


@pytest.fixture
def mcp_client():
    return McpClient("http://mcp.test", "secret")


async def test_call_tool_returns_parsed_json_from_text_content(mcp, mcp_client):
    mcp.session.call_tool.return_value = text_result({"times": ["09:00", "10:30"]})

    assert await mcp_client.call_tool("get_available_times", {"date": "2026-09-20"}) == {
        "times": ["09:00", "10:30"]
    }


async def test_call_tool_prefers_structured_content(mcp, mcp_client):
    mcp.session.call_tool.return_value = types.CallToolResult(
        content=[types.TextContent(type="text", text="ignored")], structured_content={"a": 1}
    )

    assert await mcp_client.call_tool("get_club_info", {}) == {"a": 1}


async def test_call_tool_returns_plain_text_when_not_json(mcp, mcp_client):
    mcp.session.call_tool.return_value = text_result("hola")

    assert await mcp_client.call_tool("get_club_info", {}) == "hola"


async def test_call_tool_raises_tool_error_with_server_message(mcp, mcp_client):
    mcp.session.call_tool.return_value = text_result("Time slot is not available", is_error=True)

    with pytest.raises(ToolError, match="Time slot is not available"):
        await mcp_client.call_tool("create_booking", {})


async def test_call_tool_passes_name_and_arguments(mcp, mcp_client):
    args = {"time": "13:30", "date": "2026-09-20"}

    await mcp_client.call_tool("check_time_availability", args)

    mcp.session.call_tool.assert_awaited_once_with("check_time_availability", args)


async def test_list_tools_returns_the_server_tools(mcp, mcp_client):
    assert await mcp_client.list_tools() == ["tool-a", "tool-b"]


async def test_sends_api_key_header_and_connects_to_server_url(mcp, mcp_client):
    await mcp_client.connect()

    assert mcp.headers == [{"x-api-key": "secret"}]
    assert mcp.urls == ["http://mcp.test"]
    assert mcp.streams == ("read-stream", "write-stream")


async def test_initializes_the_session_before_the_first_call(mcp, mcp_client):
    order = []
    mcp.session.initialize.side_effect = lambda: order.append("initialize")
    mcp.session.call_tool.side_effect = lambda *a, **k: order.append("call_tool") or text_result({})

    await mcp_client.call_tool("get_club_info", {})

    assert order == ["initialize", "call_tool"]


async def test_reuses_one_session_across_calls(mcp, mcp_client):
    await mcp_client.call_tool("get_club_info", {})
    await mcp_client.call_tool("get_club_info", {})
    await mcp_client.list_tools()

    assert mcp.opened == 1
    mcp.session.initialize.assert_awaited_once()


async def test_concurrent_first_calls_open_a_single_connection(mcp, mcp_client):
    await asyncio.gather(*(mcp_client.call_tool("get_club_info", {}) for _ in range(10)))

    assert mcp.opened == 1


async def test_reconnects_and_retries_once_when_the_transport_fails(mcp, mcp_client):
    mcp.session.call_tool.side_effect = [ConnectionError("dropped"), text_result({"ok": True})]

    assert await mcp_client.call_tool("get_club_info", {}) == {"ok": True}
    assert mcp.opened == 2
    assert mcp.closed == 1


async def test_gives_up_after_one_retry(mcp, mcp_client):
    mcp.session.call_tool.side_effect = ConnectionError("down")

    with pytest.raises(ConnectionError):
        await mcp_client.call_tool("get_club_info", {})

    assert mcp.session.call_tool.await_count == 2


async def test_tool_errors_do_not_trigger_a_reconnect(mcp, mcp_client):
    mcp.session.call_tool.return_value = text_result("nope", is_error=True)

    with pytest.raises(ToolError):
        await mcp_client.call_tool("cancel_booking", {"bookingId": 1})

    assert mcp.opened == 1
    assert mcp.session.call_tool.await_count == 1


async def test_failed_initialization_closes_the_transport_and_propagates(mcp, mcp_client):
    mcp.session.initialize.side_effect = ConnectionError("server down")

    with pytest.raises(ConnectionError):
        await mcp_client.connect()

    assert mcp.closed == mcp.opened == 1
    mcp.session.call_tool.assert_not_awaited()


async def test_close_shuts_the_connection_and_a_later_call_reconnects(mcp, mcp_client):
    await mcp_client.connect()
    await mcp_client.close()

    assert mcp.closed == 1

    await mcp_client.call_tool("get_club_info", {})

    assert mcp.opened == 2


async def test_close_without_connecting_is_a_noop(mcp, mcp_client):
    await mcp_client.close()

    assert mcp.opened == 0
