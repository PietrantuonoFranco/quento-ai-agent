"""Console chat with the agent, to try the prompt and tools without WhatsApp.

    uv run python chat.py [--phone 5491100000000] [--name "Fran"]
"""

import argparse
import asyncio
import logging

from google.genai import types

from agent import build_agent
from client import mcp_client


async def main(phone: str, name: str | None) -> None:
    agent = build_agent()
    history: list[types.Content] = []

    await mcp_client.connect()
    print(f"Chateando como {phone}" + (f" ({name})" if name else "") + ". Ctrl+C o 'salir' para terminar.\n")
    try:
        while True:
            try:
                text = await asyncio.to_thread(input, "Vos: ")
            except (EOFError, KeyboardInterrupt):
                break
            if text.strip().lower() in {"salir", "exit", "quit"}:
                break
            if not text.strip():
                continue

            print(f"\nBot: {await agent.respond(history, text, phone, name)}\n")
    finally:
        await mcp_client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phone", default="5491100000000", help="número que simula ser el del cliente")
    parser.add_argument("--name", default=None, help="nombre de perfil de WhatsApp (opcional)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    asyncio.run(main(args.phone, args.name))
