"""
Configuration module. Loads settings from .env (backend/.env).
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_PATH = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH) if _ENV_PATH.exists() else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # PostgreSQL alternative: postgresql://postgres:password@localhost:5432/ecocode
    database_url: str = "sqlite:///ecocode.db"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3-vl:8b"
    llm_provider: str = "openai"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"

    frontend_url: str = ""

    semgrep_bin: str = "semgrep"
    temp_repo_dir: str = "./temp_repos"


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance. Loads from .env on first call."""
    return Settings()
