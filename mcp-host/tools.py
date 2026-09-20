"""Bridge between the MCP server's tools and Gemini's function calling."""

from typing import Any

from google.genai import types
from mcp import types as mcp_types

# Arguments that identify the customer. The model never sees or fills them: the host
# overwrites them with the number the WhatsApp message came from, so the model can't act on
# somebody else's bookings.
PHONE_FIELDS = frozenset({"phoneNumber", "bookerPhoneNumber"})

# Tools kept away from the model on purpose.
# join_match / leave_match take a `playerId`, and no tool maps a phone number to one, so the
# model would have to guess ids (and could enrol anyone). Re-enable once the server resolves
# the player from the phone number.
HIDDEN_TOOLS = frozenset({"join_match", "leave_match"})


def visible_tools(tools: list[mcp_types.Tool]) -> list[mcp_types.Tool]:
    return [t for t in tools if t.name not in HIDDEN_TOOLS]


def _model_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """The tool's JSON schema without the phone fields (which the host injects)."""
    schema = {k: v for k, v in schema.items() if k != "$schema"}
    properties = {k: v for k, v in schema.get("properties", {}).items() if k not in PHONE_FIELDS}

    schema["properties"] = properties
    if "required" in schema:
        required = [name for name in schema["required"] if name not in PHONE_FIELDS]
        if required:
            schema["required"] = required
        else:
            del schema["required"]

    return schema


def to_function_declarations(tools: list[mcp_types.Tool]) -> list[types.FunctionDeclaration]:
    return [
        types.FunctionDeclaration(
            name=tool.name,
            description=tool.description or "",
            parameters_json_schema=_model_schema(tool.input_schema),
        )
        for tool in visible_tools(tools)
    ]


def inject_phone(tool: mcp_types.Tool, arguments: dict[str, Any], phone: str) -> dict[str, Any]:
    """Overwrite the tool's phone arguments with the customer's real number."""
    phone_args = PHONE_FIELDS & set(tool.input_schema.get("properties", {}))
    # Drop whatever the model may have sent for those fields, even if it shouldn't have.
    return {**{k: v for k, v in arguments.items() if k not in PHONE_FIELDS}, **dict.fromkeys(phone_args, phone)}
