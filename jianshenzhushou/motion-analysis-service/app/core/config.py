from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    analysis_fps: int = 6
    workspace_dir: str = "tmp"
    motion_callback_url: str = ""
    motion_callback_token: str = ""
    request_timeout_seconds: int = 20

    model_config = SettingsConfigDict(
        env_prefix="MOTION_",
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
