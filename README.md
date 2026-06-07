# Taskflow (JS) — Working Prototype

Taskflow is a minimal Manus-style agent prototype built with Next.js (App
Router) + LangChain/LangGraph. Give it a goal; it plans the steps, executes
them with tools, verifies each result, and delivers a consolidated answer.

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

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |

CI (`.github/workflows/ci.yml`) runs lint, tests, and the build on every push
and pull request.

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

## How it works

1. **Plan** — the request is broken into a capped, checklist-style plan.
2. **Execute** — each step runs with tools (`web_search`, `execute_python`,
   `read_file`, `write_file`).
3. **Verify** — each step is checked; failures retry a bounded number of times,
   then skip so a single hard step can't stall the run.
4. **Summarize** — a final synthesis step writes a consolidated answer.

Execution is deterministically bounded (`MAX_PLAN_STEPS`, `MAX_STEP_ATTEMPTS`,
`RECURSION_LIMIT` in `lib/agent/graph.ts`), giving a provable upper bound on LLM
calls per run — no runaway loops or surprise bills.

## Notes / limitations

- Task artifacts are written to `/tmp/tasks_data/<taskId>/`:
  `task_plan.md`, `findings.md`, `progress.md`, `summary.md`, and a durable
  `status.json`. With Docker Compose this is persisted via a named volume; mount
  it on a persistent disk to retain history across restarts.
- Without `SERPER_API_KEY`, `web_search` returns a simulated result (no network
  call), so the prototype runs end-to-end without it.
- `execute_python` is an env-gated opt-in: set `E2B_API_KEY` to run code in an
  isolated [E2B](https://e2b.dev) cloud sandbox; without it the tool returns a
  safe stub (no in-process code execution).
- Deploying to fully serverless environments (where background work is frozen
  after the response) will require a queue/worker; this prototype targets a
  long-running Node server (local/Docker/VM).

## License

MIT — see [LICENSE](./LICENSE).
