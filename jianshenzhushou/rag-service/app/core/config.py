from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


SERVICE_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = SERVICE_DIR.parent.parent


class Settings(BaseSettings):
    siliconflow_api_key: str = Field(default="", alias="SILICONFLOW_API_KEY")
    siliconflow_base_url: str = Field(default="https://api.siliconflow.cn/v1", alias="SILICONFLOW_BASE_URL")
    rag_chat_model: str = Field(default="Pro/moonshotai/Kimi-K2.5", alias="RAG_CHAT_MODEL")
    rag_embedding_model: str = Field(default="BAAI/bge-m3", alias="RAG_EMBEDDING_MODEL")
    rag_api_token: str = Field(default="", alias="RAG_API_TOKEN")
    rag_top_k: int = Field(default=5, alias="RAG_TOP_K")
    rag_chunk_size: int = Field(default=700, alias="RAG_CHUNK_SIZE")
    rag_chunk_overlap: int = Field(default=120, alias="RAG_CHUNK_OVERLAP")
    rag_request_timeout_seconds: int = Field(default=45, alias="RAG_REQUEST_TIMEOUT_SECONDS")
    rag_embedding_batch_size: int = Field(default=24, alias="RAG_EMBEDDING_BATCH_SIZE")
    rag_chroma_collection: str = Field(default="fitagent_knowledge", alias="RAG_CHROMA_COLLECTION")
    rag_chroma_dir: str = Field(default=str(SERVICE_DIR / ".chroma"), alias="RAG_CHROMA_DIR")
    rag_knowledge_base_dir: str = Field(
        default=str(PROJECT_ROOT / "knowledge_base"),
        alias="RAG_KNOWLEDGE_BASE_DIR",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )


settings = Settings()
