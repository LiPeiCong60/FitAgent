# FitAgent RAG MVP

## Added Components

- `jianshenzhushou/rag-service/`: FastAPI RAG service.
- `knowledge_base/`: source Markdown fitness knowledge.
- `aiSuggest` cloud function integration: tries RAG first for `action: "chat"`, then falls back to the original LLM path.

## Run RAG Service

```bash
cd jianshenzhushou/rag-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```bash
SILICONFLOW_API_KEY=your_api_key_here
RAG_API_TOKEN=your_optional_shared_token
```

Start:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

## Test

```bash
curl http://127.0.0.1:8001/healthz
curl -X POST http://127.0.0.1:8001/rag/reindex \
  -H "Authorization: Bearer $RAG_API_TOKEN"
```

Chat test:

```bash
curl -X POST http://127.0.0.1:8001/rag/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAG_API_TOKEN" \
  -d '{"user_id":"test","question":"减脂期蛋白质怎么吃？","user_context":{"profile":{"weight":80,"goal":"lose"},"recent_diet_records":[],"recent_workout_records":[]}}'
```

## Cloud Function Environment

Configure `aiSuggest`:

```bash
SILICONFLOW_API_KEY=your_api_key_here
RAG_ENABLED=true
RAG_SERVICE_URL=http://your-rag-service-host:8001
RAG_SERVICE_TOKEN=your_optional_shared_token
RAG_SERVICE_TIMEOUT_MS=12000
```

Fallback is preserved: if `RAG_SERVICE_URL` is missing, `RAG_ENABLED=false`, or the RAG service is unavailable, the original `aiSuggest` LLM chat path is used.

For local testing, `http://127.0.0.1:8001` is fine. For deployed WeChat cloud functions, set `RAG_SERVICE_URL` to a public HTTPS endpoint or an internal address that the cloud function can reach; `127.0.0.1` would point to the cloud function runtime itself, not your laptop.
