from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class KnowledgeChunk:
    chunk_id: str
    source: str
    title: str
    text: str


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _chunk_plain_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            if current:
                chunks.append(current.strip())
                current = ""
            start = 0
            while start < len(paragraph):
                end = min(len(paragraph), start + chunk_size)
                chunks.append(paragraph[start:end].strip())
                if end >= len(paragraph):
                    break
                start = max(0, end - overlap)
            continue

        if not current:
            current = paragraph
        elif len(current) + len(paragraph) + 2 <= chunk_size:
            current = f"{current}\n\n{paragraph}"
        else:
            chunks.append(current.strip())
            prefix = current[-overlap:].strip() if overlap > 0 else ""
            current = f"{prefix}\n\n{paragraph}".strip() if prefix else paragraph

    if current:
        chunks.append(current.strip())

    return [chunk for chunk in chunks if chunk]


def _split_markdown_sections(content: str) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []
    heading_stack: list[tuple[int, str]] = []
    body_lines: list[str] = []

    def flush() -> None:
        body = _normalize_text("\n".join(body_lines))
        if not body:
            return
        title = " / ".join(title for _, title in heading_stack)
        sections.append((title, body))

    for line in content.splitlines():
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if not match:
            body_lines.append(line)
            continue

        flush()
        body_lines = []
        level = len(match.group(1))
        title = match.group(2).strip()
        heading_stack = [(h_level, h_title) for h_level, h_title in heading_stack if h_level < level]
        heading_stack.append((level, title))

    flush()
    return sections


def load_markdown_chunks(knowledge_base_dir: str | Path, chunk_size: int, overlap: int) -> list[KnowledgeChunk]:
    base_dir = Path(knowledge_base_dir).expanduser().resolve()
    if not base_dir.exists():
        raise FileNotFoundError(f"knowledge_base directory not found: {base_dir}")

    chunks: list[KnowledgeChunk] = []
    for path in sorted(base_dir.glob("*.md")):
        content = _normalize_text(path.read_text(encoding="utf-8"))
        for section_index, (title, section_text) in enumerate(_split_markdown_sections(content)):
            title_prefix = f"{title}\n\n" if title else ""
            for chunk_index, chunk_text in enumerate(_chunk_plain_text(section_text, chunk_size, overlap)):
                full_text = f"{title_prefix}{chunk_text}".strip()
                raw_id = f"{path.name}:{section_index}:{chunk_index}:{full_text[:80]}"
                chunk_id = hashlib.sha1(raw_id.encode("utf-8")).hexdigest()
                chunks.append(
                    KnowledgeChunk(
                        chunk_id=chunk_id,
                        source=path.name,
                        title=title,
                        text=full_text,
                    )
                )

    if not chunks:
        raise ValueError(f"no markdown chunks found in {base_dir}")
    return chunks


def fingerprint_knowledge_base(knowledge_base_dir: str | Path) -> str:
    base_dir = Path(knowledge_base_dir).expanduser().resolve()
    digest = hashlib.sha256()
    for path in sorted(base_dir.glob("*.md")):
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()
