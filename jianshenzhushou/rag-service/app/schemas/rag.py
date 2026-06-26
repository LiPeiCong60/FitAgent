from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class RagChatRequest(BaseModel):
    user_id: str = Field(default="anonymous")
    question: str
    user_context: dict[str, Any] = Field(default_factory=dict)
    top_k: Optional[int] = None


class RagSource(BaseModel):
    source: str
    title: str = ""
    chunk_id: str
    score: Optional[float] = None


class RagChatResponse(BaseModel):
    answer: str
    sources: list[RagSource] = Field(default_factory=list)
    used_rag: bool = True


class HealthResponse(BaseModel):
    status: str
    knowledge_base_dir: str
    vector_count: int = 0
