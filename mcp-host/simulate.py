"""Fake WhatsApp: sends a signed webhook to a running mcp-host, as Meta would.

Start the host with WHATSAPP_DRY_RUN=true and read the replies in its logs:

    uv run uvicorn main:app
    uv run python simulate.py "Hola, qué horarios hay mañana?" [--phone 5491100000000] [--name Fran]
    uv run python simulate.py --audio     # a non-text message
"""

import argparse
import hashlib
import hmac
import json
import time
import uuid

import httpx

from config import conf


def build_payload(text: str | None, phone: str, name: str | None) -> dict:
    message = {"from": phone, "id": f"wamid.{uuid.uuid4().hex}", "timestamp": str(int(time.time()))}
    if text is None:
        message |= {"type": "audio", "audio": {"id": "fake-media-id", "mime_type": "audio/ogg"}}
    else:
        message |= {"type": "text", "text": {"body": text}}

    contact = {"wa_id": phone, **({"profile": {"name": name}} if name else {})}
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "fake-waba-id",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": conf.WHATSAPP_PHONE_NUMBER_ID or "fake"},
                            "contacts": [contact],
                            "messages": [message],
                        },
                    }
                ],
            }
        ],
    }


def sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("text", nargs="?", help="message text")
    parser.add_argument("--audio", action="store_true", help="send an audio message instead of text")
    parser.add_argument("--phone", default="5491100000000")
    parser.add_argument("--name", default=None, help="WhatsApp profile name")
    parser.add_argument("--url", default="http://localhost:8000/webhook")
    args = parser.parse_args()
    if not args.audio and not args.text:
        parser.error("pass a text or --audio")

    body = json.dumps(build_payload(None if args.audio else args.text, args.phone, args.name)).encode()
    headers = {"Content-Type": "application/json", "X-Hub-Signature-256": sign(body, conf.WHATSAPP_APP_SECRET)}
    response = httpx.post(args.url, content=body, headers=headers)
    print(response.status_code, response.text)
