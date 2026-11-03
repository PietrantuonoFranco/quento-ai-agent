import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from agent import FALLBACK_REPLY
from config import conf
from whatsapp import IncomingMessage, parse_messages, verify_signature

logger = logging.getLogger(__name__)

router = APIRouter()

NON_TEXT_REPLY = "Por ahora solo puedo atender mensajes de texto. ¿Me escribís lo que necesitás?"


@router.get("/webhook")
def verify_webhook(
    mode: str | None = Query(None, alias="hub.mode"),
    token: str | None = Query(None, alias="hub.verify_token"),
    challenge: str | None = Query(None, alias="hub.challenge"),
) -> PlainTextResponse:
    """Meta calls this once when the webhook is configured."""
    if mode != "subscribe" or not conf.WHATSAPP_VERIFY_TOKEN or token != conf.WHATSAPP_VERIFY_TOKEN:
        raise HTTPException(status_code=403)
    return PlainTextResponse(challenge or "")


@router.post("/webhook")
async def receive_webhook(request: Request, background: BackgroundTasks) -> dict[str, str]:
    body = await request.body()
    if not verify_signature(body, request.headers.get("X-Hub-Signature-256"), conf.WHATSAPP_APP_SECRET):
        raise HTTPException(status_code=403)

    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400)

    state = request.app.state
    for message in parse_messages(payload if isinstance(payload, dict) else {}):
        # Deduplicated here, before answering 200, so a Meta retry is dropped even while we're still processing.
        if state.seen.add(message.id):
            background.add_task(handle_message, request.app, message)
    return {"status": "ok"}


async def handle_message(app, message: IncomingMessage) -> None:
    state = app.state
    try:
        if message.text is None:
            await state.sender.send_text(message.phone, NON_TEXT_REPLY)
            return

        async with state.store.lock(message.phone):
            history = state.store.get(message.phone)
            reply = await state.agent.respond(history, message.text, message.phone, message.profile_name)
            state.store.save(message.phone, history)
        await state.sender.send_text(message.phone, reply)
    except Exception:
        logger.exception("Failed to handle message %s", message.id)
        try:
            await state.sender.send_text(message.phone, FALLBACK_REPLY)
        except Exception:
            logger.exception("Failed to send the fallback reply for %s", message.id)
