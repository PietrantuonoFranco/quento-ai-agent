from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import client


@pytest.fixture
def mcp(monkeypatch):
    """Reemplaza el transporte y la sesión MCP; expone los mocks para inspeccionarlos."""
    session = MagicMock()
    session.initialize = AsyncMock()
    session.call_tool = AsyncMock(return_value=SimpleNamespace(structuredContent={"ok": True}))

    calls = SimpleNamespace(session=session, transport_urls=[], order=[])

    @asynccontextmanager
    async def fake_transport(url):
        calls.transport_urls.append(url)
        yield ("read-stream", "write-stream", lambda: None)

    class FakeClientSession:
        def __init__(self, read, write):
            calls.streams = (read, write)

        async def __aenter__(self):
            return session

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(client, "streamable_http_client", fake_transport)
    monkeypatch.setattr(client, "ClientSession", FakeClientSession)

    return calls


async def test_call_tool_returns_structured_content(mcp):
    result = await client.call_tool("get_available_times", {"date": "2026-09-20"})

    assert result == {"ok": True}


async def test_call_tool_connects_to_configured_server_url(mcp):
    await client.call_tool("get_club_info", {})

    assert mcp.transport_urls == ["http://mcp.test"]
    assert mcp.streams == ("read-stream", "write-stream")


async def test_call_tool_initializes_session_before_calling(mcp):
    order = []
    mcp.session.initialize.side_effect = lambda: order.append("initialize")
    mcp.session.call_tool.side_effect = lambda *a, **k: (
        order.append("call_tool") or SimpleNamespace(structuredContent=None)
    )

    await client.call_tool("get_club_info", {})

    assert order == ["initialize", "call_tool"]


async def test_call_tool_passes_name_and_arguments(mcp):
    args = {"time": "13:30", "date": "2026-09-20"}

    await client.call_tool("check_time_availability", args)

    mcp.session.call_tool.assert_awaited_once_with("check_time_availability", args)


async def test_call_tool_returns_none_without_structured_content(mcp):
    mcp.session.call_tool.return_value = SimpleNamespace(structuredContent=None)

    assert await client.call_tool("get_club_info", {}) is None


async def test_call_tool_propagates_tool_errors(mcp):
    mcp.session.call_tool.side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        await client.call_tool("cancel_booking", {"bookingId": 1})


async def test_call_tool_propagates_initialization_errors(mcp):
    mcp.session.initialize.side_effect = ConnectionError("server down")

    with pytest.raises(ConnectionError):
        await client.call_tool("get_club_info", {})

    mcp.session.call_tool.assert_not_awaited()
