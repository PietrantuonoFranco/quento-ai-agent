from contextlib import asynccontextmanager

from fastapi import FastAPI

from client import mcp_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mcp_client.connect()
    try:
        yield
    finally:
        await mcp_client.close()


app = FastAPI(lifespan=lifespan)


@app.get("/")
def health() -> dict[str, str]:
    return {"status": "ok"}
