from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_check_returns_ok():
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_route_returns_404():
    assert client.get("/no-existe").status_code == 404


def test_health_only_accepts_get():
    assert client.post("/").status_code == 405


def test_lifespan_connects_and_closes_the_mcp_client(monkeypatch):
    from unittest.mock import AsyncMock

    import main

    connect, close = AsyncMock(), AsyncMock()
    monkeypatch.setattr(main.mcp_client, "connect", connect)
    monkeypatch.setattr(main.mcp_client, "close", close)

    with TestClient(main.app):
        connect.assert_awaited_once()
        close.assert_not_awaited()

    close.assert_awaited_once()
