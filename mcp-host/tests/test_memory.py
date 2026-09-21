from google.genai import types

from memory import ConversationStore, SeenMessages


def user(text):
    return types.Content(role="user", parts=[types.Part(text=text)])


def model(text):
    return types.Content(role="model", parts=[types.Part(text=text)])


def tool_call():
    return types.Content(role="model", parts=[types.Part.from_function_call(name="t", args={})])


def tool_result():
    return types.Content(role="user", parts=[types.Part.from_function_response(name="t", response={"result": 1})])


class Clock:
    now = 0.0

    def __call__(self):
        return self.now


def test_unknown_phone_has_empty_history():
    assert ConversationStore().get("1") == []


def test_saved_history_is_returned_as_a_copy():
    store = ConversationStore()
    store.save("1", [user("hola"), model("hey")])

    history = store.get("1")
    history.append(user("otro"))

    assert len(store.get("1")) == 2


def test_history_is_separate_per_phone():
    store = ConversationStore()
    store.save("1", [user("a"), model("b")])

    assert store.get("2") == []


def test_conversation_expires_after_ttl():
    clock = Clock()
    store = ConversationStore(ttl=100, clock=clock)
    store.save("1", [user("a"), model("b")])

    clock.now = 99
    assert len(store.get("1")) == 2
    clock.now = 101
    assert store.get("1") == []


def test_trim_keeps_the_last_messages_starting_at_a_user_text():
    store = ConversationStore(max_messages=4)
    store.save("1", [user("1"), model("1"), user("2"), tool_call(), tool_result(), model("2")])

    assert [c.role for c in store.get("1")] == ["user", "model", "user", "model"]


def test_trim_moves_forward_when_the_cut_lands_on_a_tool_call():
    store = ConversationStore(max_messages=3)
    store.save("1", [user("1"), model("1"), user("2"), tool_call(), tool_result(), model("2")])

    # The last 3 start at the tool call, which is not a valid start.
    assert store.get("1") == []


def test_trim_never_starts_with_a_tool_result():
    store = ConversationStore(max_messages=2)
    store.save("1", [user("q"), tool_call(), tool_result(), model("a")])

    assert store.get("1") == []


def test_same_phone_shares_a_lock():
    store = ConversationStore()

    assert store.lock("1") is store.lock("1")
    assert store.lock("1") is not store.lock("2")


def test_seen_messages_detects_repeats():
    seen = SeenMessages()

    assert seen.add("a") is True
    assert seen.add("a") is False
    assert seen.add("b") is True


def test_seen_messages_forget_after_ttl():
    clock = Clock()
    seen = SeenMessages(ttl=10, clock=clock)
    seen.add("a")

    clock.now = 11

    assert seen.add("a") is True
