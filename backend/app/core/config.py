from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from pydantic import Field, model_validator

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
    groq_api_key: str
    groq_model: str = "llama-3.3-70b-versatile"
    groq_timeout_seconds: float = Field(default=30, gt=0, le=120)
    rag_corpus_path: Path = Path("notebooks/retrieval_evaluation_data.json")
    rag_retrieval_k: int = Field(default=10, ge=1, le=100)
    rag_candidate_k: int = Field(default=10, ge=1, le=100)
    rag_final_k: int = Field(default=5, ge=1, le=100)
    rag_initialization_retry_seconds: int = Field(default=60, ge=1)
    conversation_history_turns: int = Field(default=3, ge=0, le=10)

    @model_validator(mode="after")
    def validate_rag_limits(self):
        if not self.rag_final_k <= self.rag_retrieval_k <= self.rag_candidate_k:
            raise ValueError("Require rag_final_k <= rag_retrieval_k <= rag_candidate_k")
        return self
    
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8"
    )


settings = Settings()
