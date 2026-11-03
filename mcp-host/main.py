from contextlib import asynccontextmanager

from fastapi import FastAPI

from agent import build_agent
from client import mcp_client
from memory import ConversationStore, SeenMessages
from webhook import router
from whatsapp import build_sender


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.agent = build_agent()
    app.state.sender = build_sender()
    app.state.store = ConversationStore()
    app.state.seen = SeenMessages()

    await mcp_client.connect()
    try:
        yield
    finally:
        await mcp_client.close()
        await app.state.sender.close()


app = FastAPI(lifespan=lifespan)
app.include_router(router)


@app.get("/")
def health() -> dict[str, str]:
    return {"status": "ok"}
