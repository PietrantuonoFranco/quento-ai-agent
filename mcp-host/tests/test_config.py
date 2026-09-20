import pytest
from pydantic import ValidationError

from config import Settings


def test_conf_loads_values_from_environment():
    from config import conf

    assert conf.MCP_SERVER_URL == "http://mcp.test"
    assert conf.LLM_URL == "http://llm.test"


def test_settings_ignores_extra_variables(monkeypatch):
    monkeypatch.setenv("SOMETHING_ELSE", "x")

    settings = Settings()

    assert not hasattr(settings, "SOMETHING_ELSE")


@pytest.mark.parametrize("missing", ["MCP_SERVER_URL", "LLM_URL"])
def test_settings_requires_mandatory_variables(monkeypatch, missing):
    monkeypatch.delenv(missing)

    # _env_file=None para que no complete el faltante desde un .env local
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
