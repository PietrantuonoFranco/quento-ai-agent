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


conf = Settings()