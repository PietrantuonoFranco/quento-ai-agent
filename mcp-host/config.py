from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    # Config to load environment variables from a .env file and ignore extra fields
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8", 
        extra="ignore"
    )

    # Configurations for the MCP Host
    MCP_SERVER_URL: str = Field(..., validation_alias="MCP_SERVER_URL")
    MCP_API_KEY: str = Field(..., validation_alias="MCP_API_KEY")

    # Gemini
    GEMINI_API_KEY: str = Field(..., validation_alias="GEMINI_API_KEY")
    GEMINI_MODEL: str = Field("gemini-3.6-flash", validation_alias="GEMINI_MODEL")

    # WhatsApp Cloud API. Empty secrets make the webhook reject everything (fail closed).
    WHATSAPP_VERIFY_TOKEN: str = Field("", validation_alias="WHATSAPP_VERIFY_TOKEN")
    WHATSAPP_APP_SECRET: str = Field("", validation_alias="WHATSAPP_APP_SECRET")
    WHATSAPP_ACCESS_TOKEN: str = Field("", validation_alias="WHATSAPP_ACCESS_TOKEN")
    WHATSAPP_PHONE_NUMBER_ID: str = Field("", validation_alias="WHATSAPP_PHONE_NUMBER_ID")
    WHATSAPP_API_VERSION: str = Field("v21.0", validation_alias="WHATSAPP_API_VERSION")
    # Log replies instead of sending them: try the webhook without a Meta account.
    WHATSAPP_DRY_RUN: bool = Field(False, validation_alias="WHATSAPP_DRY_RUN")


conf = Settings()