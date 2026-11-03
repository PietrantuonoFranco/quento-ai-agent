import json
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.genai import types

import webhook
from memory import ConversationStore, SeenMessages
from simulate import build_payload, sign

SECRET = "app-secret"
VERIFY_TOKEN = "verify-me"


class FakeSender:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send_text(self, phone, text):
        self.sent.append((phone, text))


@pytest.fixture(autouse=True)
def whatsapp_conf(monkeypatch):
    monkeypatch.setattr(webhook.conf, "WHATSAPP_APP_SECRET", SECRET)
    monkeypatch.setattr(webhook.conf, "WHATSAPP_VERIFY_TOKEN", VERIFY_TOKEN)


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(webhook.router)
    app.state.agent = AsyncMock()
    app.state.agent.respond.return_value = "Hola, soy el bot"
    app.state.sender = FakeSender()
    app.state.store = ConversationStore()
    app.state.seen = SeenMessages()
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


def post(client, payload, secret=SECRET):
    body = json.dumps(payload).encode()
    return client.post(
        "/webhook", content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": sign(body, secret)}
    )


# GET /webhook


def test_verification_echoes_the_challenge(client):
    r = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1234"})

    assert r.status_code == 200
    assert r.text == "1234"


def test_verification_rejects_a_wrong_token(client):
    r = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1234"})

    assert r.status_code == 403


def test_verification_rejects_when_no_token_is_configured(client, monkeypatch):
    monkeypatch.setattr(webhook.conf, "WHATSAPP_VERIFY_TOKEN", "")

    r = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1234"})

    assert r.status_code == 403


# POST /webhook


def test_invalid_signature_is_rejected_and_nothing_runs(client, app):
    r = post(client, build_payload("hola", "549111", None), secret="other")

    assert r.status_code == 403
    app.state.agent.respond.assert_not_awaited()


def test_missing_signature_is_rejected(client):
    assert client.post("/webhook", json=build_payload("hola", "549111", None)).status_code == 403


def test_text_message_is_answered_with_the_agents_reply(client, app):
    r = post(client, build_payload("hola", "549111", "Fran"))

    assert r.status_code == 200
    app.state.agent.respond.assert_awaited_once()
    args = app.state.agent.respond.await_args.args
    assert args[1:] == ("hola", "549111", "Fran")
    assert app.state.sender.sent == [("549111", "Hola, soy el bot")]


def test_retried_message_is_processed_once(client, app):
    payload = build_payload("hola", "549111", None)

    post(client, payload)
    post(client, payload)

    assert app.state.agent.respond.await_count == 1
    assert len(app.state.sender.sent) == 1


def test_non_text_message_gets_the_text_only_reply(client, app):
    post(client, build_payload(None, "549111", None))

    app.state.agent.respond.assert_not_awaited()
    assert app.state.sender.sent == [("549111", webhook.NON_TEXT_REPLY)]


def test_status_updates_are_ignored(client, app):
    payload = {"entry": [{"changes": [{"value": {"statuses": [{"id": "x", "status": "delivered"}]}}]}]}

    assert post(client, payload).status_code == 200
    assert app.state.sender.sent == []


def test_invalid_json_body_is_a_400(client):
    body = b"not json"
    r = client.post("/webhook", content=body, headers={"X-Hub-Signature-256": sign(body, SECRET)})

    assert r.status_code == 400


def test_history_is_kept_between_messages_of_the_same_phone(client, app):
    lengths = []

    async def respond(history, text, phone, name):
        lengths.append(len(history))
        history.append(types.Content(role="user", parts=[types.Part(text=text)]))
        history.append(types.Content(role="model", parts=[types.Part(text="ok")]))
        return "ok"

    app.state.agent.respond.side_effect = respond

    post(client, build_payload("uno", "549111", None))
    post(client, build_payload("dos", "549111", None))
    post(client, build_payload("otro", "549222", None))

    assert lengths == [0, 2, 0]


def test_agent_failure_sends_the_fallback_and_keeps_history_clean(client, app):
    app.state.agent.respond.side_effect = RuntimeError("boom")

    r = post(client, build_payload("hola", "549111", None))

    assert r.status_code == 200
    assert app.state.sender.sent == [("549111", webhook.FALLBACK_REPLY)]
    assert app.state.store.get("549111") == []
