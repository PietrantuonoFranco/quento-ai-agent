from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from config import conf


async def call_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any] | None:
    """Connect to the MCP server, call a tool and return its structured result."""
    async with streamable_http_client(conf.MCP_SERVER_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)
            return result.structuredContent