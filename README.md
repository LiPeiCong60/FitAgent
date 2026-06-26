# FitAgent

AI fitness assistant WeChat Mini Program with cloud functions, a RAG knowledge base, and optional motion analysis service.

## Layout

- `jianshenzhushou/`: WeChat Mini Program source, cloud functions, RAG service, and motion analysis service.
- `knowledge_base/`: Markdown fitness knowledge used by the RAG service.
- `README_RAG.md`: RAG setup notes.

## Privacy and Secrets

This repository is prepared for public GitHub upload:

- AI provider keys are read from environment variables and are not committed.
- `.env`, `project.private.config.json`, dependency folders, virtual environments, archives, caches, logs, and common photo/video formats are ignored.
- WeChat `appid` values in `project.config.json` are replaced with `touristappid`. Use your real AppID locally or keep it in `project.private.config.json`.

## Local Setup

Open `jianshenzhushou/` in WeChat Developer Tools.

For the RAG service:

```bash
cd jianshenzhushou/rag-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set local values in `.env`, especially `SILICONFLOW_API_KEY`. Do not commit `.env`.
