"""WhatsApp Cloud API: webhook payload parsing, signature check and outgoing messages."""

import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from config import conf

logger = logging.getLogger(__name__)

GRAPH_URL = "https://graph.facebook.com"
# WhatsApp rejects text bodies longer than this.
MAX_TEXT_LENGTH = 4096


@dataclass(frozen=True)
class IncomingMessage:
    id: str
    phone: str
    profile_name: str | None
    # None when the message is not text (audio, image, sticker...).
    text: str | None
    type: str


def verify_signature(body: bytes, header: str | None, app_secret: str) -> bool:
    """Check `X-Hub-Signature-256` (`sha256=<hex hmac of the raw body>`). Fails closed without a secret."""
    if not app_secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


def parse_messages(payload: dict[str, Any]) -> list[IncomingMessage]:
    """Extract the customer messages from a webhook payload. Delivery/read statuses yield nothing."""
    result: list[IncomingMessage] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            names = {
                c.get("wa_id"): (c.get("profile") or {}).get("name") for c in value.get("contacts") or []
            }
            for msg in value.get("messages") or []:
                msg_id, phone = msg.get("id"), msg.get("from")
                if not msg_id or not phone:
                    continue
                kind = msg.get("type") or "unknown"
                text = (msg.get("text") or {}).get("body") if kind == "text" else None
                result.append(IncomingMessage(msg_id, phone, names.get(phone), text, kind))
    return result


def _to_recipients(phone: str) -> list[str]:
    """Meta's test sandbox in Argentina has quirks:
    - AMBA (Buenos Aires, 54911) is registered by Meta as 541115...
    - Other areas (e.g. 549221) are registered without the 9 (54221...)
    - Or without transformation (549...)
    Returns candidate formats to try in priority order."""
    candidates: list[str] = []
    if phone.startswith("54911"):
        candidates.append("541115" + phone[5:])
        candidates.append("54" + phone[3:])
        candidates.append(phone)
    elif phone.startswith("549"):
        candidates.append("54" + phone[3:])
        candidates.append(phone)
    else:
        candidates.append(phone)
    return candidates


def _to_recipient(phone: str) -> str:
    """Default candidate format for recipient phone."""
    return _to_recipients(phone)[0]


class Sender(Protocol):
    async def send_text(self, phone: str, text: str) -> None: ...


class CloudApiSender:
    def __init__(self, access_token: str, phone_number_id: str, api_version: str, http: httpx.AsyncClient | None = None):
        self._url = f"{GRAPH_URL}/{api_version}/{phone_number_id}/messages"
        self._headers = {"Authorization": f"Bearer {access_token}"}
        self._http = http or httpx.AsyncClient(timeout=15)

    async def send_text(self, phone: str, text: str) -> None:
        recipients = _to_recipients(phone)
        last_response = None
        for recipient in recipients:
            body = {
                "messaging_product": "whatsapp",
                "to": recipient,
                "type": "text",
                "text": {"body": text[:MAX_TEXT_LENGTH]},
            }
            response = await self._http.post(self._url, json=body, headers=self._headers)
            if not response.is_error:
                return
            last_response = response
            logger.warning("Failed sending to %s: %s %s", recipient, response.status_code, response.text)

        if last_response is not None:
            logger.error("Meta API error for %s (all attempts failed): %s %s", phone, last_response.status_code, last_response.text)
            last_response.raise_for_status()

    async def close(self) -> None:
        await self._http.aclose()


class LogSender:
    """Dry-run sender: logs what would be sent, for trying the webhook without Meta."""

    async def send_text(self, phone: str, text: str) -> None:
        logger.info("[dry-run] to %s: %s", phone, text)

    async def close(self) -> None:
        pass


def build_sender() -> CloudApiSender | LogSender:
    if conf.WHATSAPP_DRY_RUN:
        return LogSender()
    return CloudApiSender(conf.WHATSAPP_ACCESS_TOKEN, conf.WHATSAPP_PHONE_NUMBER_ID, conf.WHATSAPP_API_VERSION)
