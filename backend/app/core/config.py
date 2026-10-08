from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    app_name: str = "AI Technical Support Resolution Assistant"
    app_version: str = "1.0.0"
    environment: str = "development"
    mongodb_uri: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    azure_storage_connection_string: str
    azure_storage_container_name: str
    pinecone_api_key: str
    pinecone_index_name: str

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8"
    )


settings = Settings()