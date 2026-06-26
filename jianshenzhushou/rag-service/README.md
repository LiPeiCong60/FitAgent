# FitAgent RAG Service

This service provides a local FastAPI RAG endpoint for the WeChat mini program AI chat flow.

## What It Does

- Reads Markdown files from the project-level `knowledge_base/` directory.
- Splits documents into chunks.
- Uses SiliconFlow embeddings to vectorize chunks.
- Stores vectors in local Chroma persistence.
- Exposes `POST /rag/chat`.
- Combines retrieved fitness knowledge with user profile, body stats, recent diet logs, recent workout logs, and the current question.

## Environment Variables

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required:

```bash
SILICONFLOW_API_KEY=your_api_key_here
```

Recommended:

```bash
RAG_API_TOKEN=change_me_optional_shared_token
RAG_CHAT_MODEL=Pro/moonshotai/Kimi-K2.5
RAG_EMBEDDING_MODEL=BAAI/bge-m3
RAG_KNOWLEDGE_BASE_DIR=../../knowledge_base
RAG_CHROMA_DIR=.chroma
RAG_TOP_K=5
```

Do not write API keys directly in code.

## Start Locally

```bash
cd jianshenzhushou/rag-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

The first `/rag/chat` or `/rag/reindex` call builds the Chroma index. The vectors are stored under `.chroma/`.

## Build Or Refresh Index

If `RAG_API_TOKEN` is set:

```bash
curl -X POST http://127.0.0.1:8001/rag/reindex \
  -H "Authorization: Bearer $RAG_API_TOKEN"
```

If no token is set:

```bash
curl -X POST http://127.0.0.1:8001/rag/reindex
```

## Test Chat

```bash
curl -X POST http://127.0.0.1:8001/rag/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAG_API_TOKEN" \
  -d '{
    "user_id": "test_user",
    "question": "我175cm、102kg，想减脂，一周练5天，蛋白质怎么安排？",
    "user_context": {
      "profile": {
        "height": 175,
        "weight": 102,
        "goal": "lose",
        "activityLevel": "high"
      },
      "body_stats": [],
      "recent_diet_records": [],
      "recent_workout_records": []
    }
  }'
```

## WeChat Cloud Function Config

Set these environment variables on the `aiSuggest` cloud function:

```bash
RAG_ENABLED=true
RAG_SERVICE_URL=http://your-rag-service-host:8001
RAG_SERVICE_TOKEN=change_me_optional_shared_token
RAG_SERVICE_TIMEOUT_MS=12000
SILICONFLOW_API_KEY=your_api_key_here
```

`RAG_SERVICE_URL` can be either the service base URL or the full `/rag/chat` URL.

When configuring the WeChat cloud function, do not use `127.0.0.1` unless the RAG service is running in the same runtime. Use a URL that the cloud function can actually reach, such as a public HTTPS endpoint or an internal network address available to the cloud function.

If the RAG service is down, times out, or returns an invalid response, `aiSuggest` automatically falls back to the original LLM chat flow.
