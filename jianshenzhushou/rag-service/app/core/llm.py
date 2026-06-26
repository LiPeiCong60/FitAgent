from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


def _supports_thinking_control(model: str) -> bool:
    name = (model or "").lower()
    return "qwen3" in name or "kimi-k2.5" in name


class SiliconFlowClient:
    def __init__(self) -> None:
        self.api_key = settings.siliconflow_api_key.strip()
        self.base_url = settings.siliconflow_base_url.rstrip("/")
        self.timeout = settings.rag_request_timeout_seconds

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("SILICONFLOW_API_KEY is not configured")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        payload = {
            "model": settings.rag_embedding_model,
            "input": texts,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/embeddings",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        rows = sorted(data.get("data", []), key=lambda item: item.get("index", 0))
        embeddings = [row.get("embedding") for row in rows]
        if len(embeddings) != len(texts) or any(not isinstance(item, list) for item in embeddings):
            raise RuntimeError("embedding API returned invalid data")
        return embeddings

    async def chat(self, messages: list[dict[str, Any]], max_tokens: int = 700, temperature: float = 0.3) -> str:
        body: dict[str, Any] = {
            "model": settings.rag_chat_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if _supports_thinking_control(settings.rag_chat_model):
            body["thinking"] = {"type": "disabled"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=body,
            )
            response.raise_for_status()
            data = response.json()

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError(f"chat API returned no choices: {str(data)[:200]}")

        content = choices[0].get("message", {}).get("content", "")
        if isinstance(content, list):
            content = "\n".join(
                item if isinstance(item, str) else str(item.get("text", ""))
                for item in content
            )
        return str(content).strip()
