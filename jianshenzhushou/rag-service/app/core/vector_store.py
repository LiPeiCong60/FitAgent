from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings
from app.core.documents import fingerprint_knowledge_base, load_markdown_chunks
from app.core.llm import SiliconFlowClient


class RagVectorStore:
    def __init__(self, llm_client: SiliconFlowClient) -> None:
        self.llm_client = llm_client
        self.persist_dir = Path(settings.rag_chroma_dir).expanduser().resolve()
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.meta_path = self.persist_dir / "fitagent_index_meta.json"
        self.client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=settings.rag_chroma_collection,
            metadata={"hnsw:space": "cosine"},
        )

    def count(self) -> int:
        return int(self.collection.count())

    def _load_meta(self) -> dict[str, Any]:
        if not self.meta_path.exists():
            return {}
        try:
            return json.loads(self.meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def _save_meta(self, fingerprint: str, chunk_count: int) -> None:
        self.meta_path.write_text(
            json.dumps(
                {
                    "fingerprint": fingerprint,
                    "chunk_count": chunk_count,
                    "embedding_model": settings.rag_embedding_model,
                    "knowledge_base_dir": settings.rag_knowledge_base_dir,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    def _reset_collection(self) -> None:
        try:
            self.client.delete_collection(settings.rag_chroma_collection)
        except Exception:
            pass
        self.collection = self.client.get_or_create_collection(
            name=settings.rag_chroma_collection,
            metadata={"hnsw:space": "cosine"},
        )

    async def ensure_index(self, force: bool = False) -> int:
        fingerprint = fingerprint_knowledge_base(settings.rag_knowledge_base_dir)
        meta = self._load_meta()
        if (
            not force
            and self.count() > 0
            and meta.get("fingerprint") == fingerprint
            and meta.get("embedding_model") == settings.rag_embedding_model
        ):
            return self.count()

        chunks = load_markdown_chunks(
            settings.rag_knowledge_base_dir,
            chunk_size=settings.rag_chunk_size,
            overlap=settings.rag_chunk_overlap,
        )
        self._reset_collection()

        batch_size = max(1, settings.rag_embedding_batch_size)
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            embeddings = await self.llm_client.embed_texts([chunk.text for chunk in batch])
            self.collection.add(
                ids=[chunk.chunk_id for chunk in batch],
                documents=[chunk.text for chunk in batch],
                metadatas=[
                    {
                        "source": chunk.source,
                        "title": chunk.title,
                    }
                    for chunk in batch
                ],
                embeddings=embeddings,
            )

        self._save_meta(fingerprint, len(chunks))
        return len(chunks)

    async def search(self, query: str, top_k: int) -> list[dict[str, Any]]:
        await self.ensure_index()
        query_embedding = (await self.llm_client.embed_texts([query]))[0]
        result = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=max(1, top_k),
            include=["documents", "metadatas", "distances"],
        )

        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        ids = (result.get("ids") or [[]])[0]

        hits: list[dict[str, Any]] = []
        for index, document in enumerate(documents):
            metadata = metadatas[index] if index < len(metadatas) else {}
            distance = distances[index] if index < len(distances) else None
            hits.append(
                {
                    "chunk_id": ids[index] if index < len(ids) else "",
                    "text": document,
                    "source": metadata.get("source", ""),
                    "title": metadata.get("title", ""),
                    "score": None if distance is None else 1 - float(distance),
                }
            )
        return hits
