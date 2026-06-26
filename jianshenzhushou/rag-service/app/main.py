from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException

from app.core.config import settings
from app.core.llm import SiliconFlowClient
from app.core.vector_store import RagVectorStore
from app.schemas.rag import HealthResponse, RagChatRequest, RagChatResponse, RagSource

app = FastAPI(title="fitagent-rag-service", version="0.1.0")
llm_client = SiliconFlowClient()
vector_store = RagVectorStore(llm_client)


def verify_token(authorization: Optional[str] = Header(default=None)) -> None:
    if not settings.rag_api_token:
        return
    expected = f"Bearer {settings.rag_api_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="invalid RAG API token")


def _json_preview(value: Any, limit: int = 2200) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str, indent=2)
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...[truncated]"


def _format_knowledge(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return "未检索到相关知识片段。"

    lines: list[str] = []
    for index, hit in enumerate(hits, start=1):
        source = hit.get("source") or "knowledge_base"
        title = hit.get("title") or ""
        text = str(hit.get("text") or "").strip()
        lines.append(f"[{index}] 来源：{source} {title}\n{text}")
    return "\n\n".join(lines)


def _build_messages(request: RagChatRequest, hits: list[dict[str, Any]]) -> list[dict[str, str]]:
    user_context = request.user_context or {}
    system_context = user_context.get("system_context") or user_context.get("system_prompt") or ""

    system_prompt = """你是中文 AI 健身助手。回答必须同时参考：
1. 用户当前问题；
2. 用户身体数据、最近饮食记录、最近训练记录；
3. RAG 检索到的健身知识片段。

规则：
- 优先使用用户真实记录；知识库只作为健身常识和安全边界补充。
- 如果知识片段与用户记录冲突，先说明不确定，再给保守建议。
- 不做疾病诊断、治疗方案或康复处方；疼痛、头晕、胸闷等风险情况提醒就医或咨询专业人员。
- 回答简洁、自然、直接。
- 如果用户明确要求记录饮食，末尾附加 $$RECORD[...]$$。
- 如果用户明确要求记录训练，末尾附加 $$WORKOUT[...]$$。

$$RECORD 格式：
[{"name":"食物名","meal_type":"breakfast|lunch|dinner|snack_am|snack_pm|snack_ev","grams":100,"calories":120,"protein":10,"fat":3,"carbs":15,"time_text":"今晚7点"}]

$$WORKOUT 格式：
[{"title":"胸肩训练","duration_minutes":45,"time_text":"今天下午","exercises":[{"name":"卧推","sets":4,"reps":"8-10次"}]}]
"""

    user_prompt = f"""用户ID：{request.user_id}

小程序原始系统上下文：
{system_context or "无"}

用户身体数据、最近饮食记录、最近训练记录：
{_json_preview(user_context)}

RAG 健身知识片段：
{_format_knowledge(hits)}

用户当前问题：
{request.question}

请基于以上信息回答。"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


@app.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(
        status="ok",
        knowledge_base_dir=settings.rag_knowledge_base_dir,
        vector_count=vector_store.count(),
    )


@app.post("/rag/reindex")
async def reindex(_: None = Depends(verify_token)) -> dict[str, int]:
    count = await vector_store.ensure_index(force=True)
    return {"vector_count": count}


@app.post("/rag/chat", response_model=RagChatResponse)
async def rag_chat(request: RagChatRequest, _: None = Depends(verify_token)) -> RagChatResponse:
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    top_k = request.top_k or settings.rag_top_k
    hits = await vector_store.search(question, top_k=top_k)
    messages = _build_messages(request, hits)
    answer = await llm_client.chat(messages, max_tokens=760, temperature=0.3)

    return RagChatResponse(
        answer=answer,
        used_rag=True,
        sources=[
            RagSource(
                source=hit.get("source") or "",
                title=hit.get("title") or "",
                chunk_id=hit.get("chunk_id") or "",
                score=hit.get("score"),
            )
            for hit in hits
        ],
    )
