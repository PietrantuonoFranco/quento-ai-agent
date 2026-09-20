from mcp import types as mcp_types

from tools import HIDDEN_TOOLS, inject_phone, to_function_declarations, visible_tools


def tool(name, properties=None, required=None):
    schema = {"type": "object", "$schema": "http://json-schema.org/draft-07/schema#", "properties": properties or {}}
    if required is not None:
        schema["required"] = required
    return mcp_types.Tool(name=name, description=f"{name} description", input_schema=schema)


CANCEL = tool(
    "cancel_booking",
    {"bookingId": {"type": "integer"}, "phoneNumber": {"type": "string"}},
    ["bookingId", "phoneNumber"],
)
CREATE = tool(
    "create_booking",
    {"courtId": {"type": "integer"}, "bookerPhoneNumber": {"type": "string"}, "datetime": {"type": "string"}},
    ["courtId", "bookerPhoneNumber", "datetime"],
)
CLUB = tool("get_club_info")


MATCH_TOOLS = ["get_open_matches", "create_match_from_booking", "join_match", "leave_match"]


def test_hides_every_open_match_tool():
    tools = [CLUB, *(tool(name) for name in MATCH_TOOLS)]

    assert [t.name for t in visible_tools(tools)] == ["get_club_info"]
    assert set(MATCH_TOOLS) == HIDDEN_TOOLS


def test_declarations_keep_name_and_description():
    (decl,) = to_function_declarations([CLUB])

    assert decl.name == "get_club_info"
    assert decl.description == "get_club_info description"


def test_declarations_do_not_expose_phone_fields():
    cancel, create = to_function_declarations([CANCEL, CREATE])

    assert set(cancel.parameters_json_schema["properties"]) == {"bookingId"}
    assert cancel.parameters_json_schema["required"] == ["bookingId"]
    assert set(create.parameters_json_schema["properties"]) == {"courtId", "datetime"}
    assert create.parameters_json_schema["required"] == ["courtId", "datetime"]


def test_declarations_drop_an_emptied_required_list():
    only_phone = tool("get_my_bookings", {"phoneNumber": {"type": "string"}}, ["phoneNumber"])

    (decl,) = to_function_declarations([only_phone])

    assert decl.parameters_json_schema["properties"] == {}
    assert "required" not in decl.parameters_json_schema


def test_declarations_strip_the_schema_keyword_and_do_not_mutate_the_tool():
    (decl,) = to_function_declarations([CANCEL])

    assert "$schema" not in decl.parameters_json_schema
    assert "phoneNumber" in CANCEL.input_schema["properties"]
    assert "$schema" in CANCEL.input_schema


def test_declarations_skip_hidden_tools():
    assert to_function_declarations([tool(name) for name in MATCH_TOOLS]) == []


def test_inject_phone_sets_the_real_number():
    assert inject_phone(CANCEL, {"bookingId": 4}, "549111") == {"bookingId": 4, "phoneNumber": "549111"}


def test_inject_phone_uses_the_booker_field_name_of_create_booking():
    args = inject_phone(CREATE, {"courtId": 1, "datetime": "2026-09-25T18:00"}, "549111")

    assert args == {"courtId": 1, "datetime": "2026-09-25T18:00", "bookerPhoneNumber": "549111"}


def test_inject_phone_overrides_a_number_sent_by_the_model():
    args = inject_phone(CANCEL, {"bookingId": 4, "phoneNumber": "someone-else"}, "549111")

    assert args["phoneNumber"] == "549111"


def test_inject_phone_removes_phone_fields_the_tool_does_not_take():
    args = inject_phone(CLUB, {"phoneNumber": "someone-else", "x": 1}, "549111")

    assert args == {"x": 1}
