import hashlib
import hmac
import json

import httpx
import pytest

from simulate import build_payload
from whatsapp import CloudApiSender, IncomingMessage, LogSender, MAX_TEXT_LENGTH, parse_messages, verify_signature


def sig(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_valid_signature():
    assert verify_signature(b"{}", sig(b"{}", "s"), "s")


@pytest.mark.parametrize("header", [None, "", "sha256=", "sha1=abc", "sha256=deadbeef"])
def test_invalid_signature_headers(header):
    assert not verify_signature(b"{}", header, "s")


def test_signature_is_rejected_when_the_body_changes():
    assert not verify_signature(b'{"a":2}', sig(b'{"a":1}', "s"), "s")


def test_signature_fails_closed_without_a_secret():
    assert not verify_signature(b"{}", sig(b"{}", ""), "")


def test_parse_text_message_with_profile_name():
    msgs = parse_messages(build_payload("hola", "549111", "Fran"))

    assert len(msgs) == 1
    assert msgs[0].phone == "549111" and msgs[0].profile_name == "Fran"
    assert msgs[0].text == "hola" and msgs[0].type == "text"


def test_parse_message_without_profile_name():
    assert parse_messages(build_payload("hola", "549111", None))[0].profile_name is None


def test_parse_non_text_message_has_no_text():
    msg = parse_messages(build_payload(None, "549111", None))[0]

    assert msg.text is None and msg.type == "audio"


@pytest.mark.parametrize("payload", [{}, {"entry": []}, {"entry": [{"changes": [{"value": {"statuses": [{}]}}]}]}, {"entry": None}])
def test_parse_payloads_without_messages(payload):
    assert parse_messages(payload) == []


def test_parse_skips_messages_missing_id_or_sender():
    payload = {"entry": [{"changes": [{"value": {"messages": [{"type": "text"}, {"id": "x"}]}}]}]}

    assert parse_messages(payload) == []


async def test_cloud_sender_posts_to_the_graph_api():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await CloudApiSender("tok", "999", "v21.0", http).send_text("549111", "hola")

    assert seen["url"] == "https://graph.facebook.com/v21.0/999/messages"
    assert seen["auth"] == "Bearer tok"
    assert seen["body"] == {
        "messaging_product": "whatsapp",
        "to": "549111",
        "type": "text",
        "text": {"body": "hola"},
    }


async def test_cloud_sender_truncates_long_text():
    bodies = []
    http = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: bodies.append(json.loads(r.content)) or httpx.Response(200, json={}))
    )

    await CloudApiSender("t", "1", "v21.0", http).send_text("5", "x" * (MAX_TEXT_LENGTH + 10))

    assert len(bodies[0]["text"]["body"]) == MAX_TEXT_LENGTH


async def test_cloud_sender_raises_on_api_errors():
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(401, json={})))

    with pytest.raises(httpx.HTTPStatusError):
        await CloudApiSender("t", "1", "v21.0", http).send_text("5", "hi")


async def test_log_sender_does_not_raise(caplog):
    caplog.set_level("INFO")

    await LogSender().send_text("549111", "hola")

    assert "hola" in caplog.text


def test_incoming_message_is_hashable_value_object():
    a = IncomingMessage("1", "5", None, "hi", "text")

    assert a == IncomingMessage("1", "5", None, "hi", "text")
