# Taskflow (JS) — Working Prototype

This is a minimal Manus-style agent prototype built with Next.js (App Router) + LangChain/LangGraph.

## Requirements

- Node.js 20+
- An OpenAI API key (`OPENAI_API_KEY`)

## Local run

```bash
cp .env.local.example .env.local
# edit .env.local and set OPENAI_API_KEY

npm ci
npm run dev
```

Open `http://localhost:3000`.

## Docker run (recommended for “agent keeps running”)

Create a `.env` file (used by `docker compose`) with at least:

```
OPENAI_API_KEY=...
# optional:
OPENAI_MODEL=gpt-4o
SERPER_API_KEY=...
```

Then:

```bash
docker compose up --build
```

Open `http://localhost:3000`.

## Notes / limitations

- Task artifacts are written to `/tmp/tasks_data/<taskId>/` (plan/findings/progress). With Docker Compose, this is persisted via a named volume.
- The included `execute_python` tool is intentionally a stub (no arbitrary code execution).
- Deploying to fully serverless environments (where background work is frozen after the response) will require a queue/worker and persistent storage; this prototype is intended for a long-running Node server (local/Docker/VM).

