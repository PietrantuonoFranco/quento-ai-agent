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
