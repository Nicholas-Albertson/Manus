# Taskflow (JS) — Working Prototype

Taskflow is a minimal Manus-style agent prototype built with Next.js (App
Router) + LangChain/LangGraph. Give it a goal; it plans the steps, executes
them with tools, verifies each result, and delivers a consolidated answer.

## Requirements

- Node.js 20+
- An LLM API key: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

## Local run

```bash
cp .env.local.example .env.local
# edit .env.local and set OPENAI_API_KEY (or ANTHROPIC_API_KEY)

npm ci
npm run dev
```

Open `http://localhost:3000`.

## Configuration

All variables are optional except one LLM key. See `.env.local.example` for
the full list with defaults; the highlights:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | At least one is required. `LLM_PROVIDER=openai\|anthropic` forces a choice when both are set (OpenAI wins by default). |
| `OPENAI_MODEL` / `ANTHROPIC_MODEL` | Override the default model per provider. |
| `SERPER_API_KEY` | Enables real `web_search` results; without it, a simulated result is returned. |
| `E2B_API_KEY` | Enables real sandboxed `execute_python` via [E2B](https://e2b.dev); without it, the tool returns a safe stub. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Per-IP task-creation rate limit. Defaults to 10 tasks / 10 minutes. |
| `REQUIRE_PLAN_APPROVAL` | Set `true` to pause after planning and require an explicit approve/reject before any execution step or tool call runs. Off by default. |
| `REDIS_URL` | Enables the durable Redis/BullMQ queue+worker instead of direct in-process execution. Unset by default. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run worker` | Run the durable-queue worker (requires `REDIS_URL`; see below) |
| `npm run worker:dev` | Same, with auto-restart on file changes |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests (Vitest) |

CI (`.github/workflows/ci.yml`) runs lint, tests, and the build on every push
and pull request, with a `redis:7-alpine` service so the queue integration
tests exercise a real Redis instance rather than skipping.

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

### Durable queue/worker mode

By default, a task's execution runs fire-and-forget inside the `web`
process — simple, but a restart mid-task loses it. To make runs survive a
restart (and scale execution across multiple workers), opt into the
Redis-backed queue:

```bash
echo "REDIS_URL=redis://redis:6379" >> .env
docker compose --profile durable up --build
```

This starts `redis` and a separate `worker` service; the API then enqueues
task runs instead of invoking the agent graph in-process. See `lib/queue.ts`
and `worker.ts`. Outside Docker, run `redis-server` locally, set
`REDIS_URL=redis://localhost:6379` in `.env.local`, and run `npm run worker`
alongside `npm run dev`.

## How it works

1. **Plan** — the request is broken into a capped, checklist-style plan.
2. **Approve** *(optional, `REQUIRE_PLAN_APPROVAL=true`)* — the graph pauses
   and waits for an explicit approve/reject before any execution step or tool
   call runs, so nothing is spent on a plan you haven't reviewed.
3. **Execute** — each step runs with tools (`web_search`, `execute_python`,
   `read_file`, `write_file`).
4. **Verify** — each step is checked; failures retry a bounded number of times,
   then skip so a single hard step can't stall the run.
5. **Summarize** — a final synthesis step writes a consolidated answer.

Execution is deterministically bounded (`MAX_PLAN_STEPS`, `MAX_STEP_ATTEMPTS`,
`RECURSION_LIMIT` in `lib/agent/limits.ts`), giving a provable upper bound on
LLM calls per run — no runaway loops or surprise bills. The UI shows this
bound as a worst-case cost estimate before you run anything, and a live
running token/cost total once a task starts (`lib/agent/cost.ts`).

## Notes / limitations

- Task artifacts are written to `/tmp/tasks_data/<taskId>/`:
  `task_plan.md`, `findings.md`, `progress.md`, `summary.md`, `usage.json`,
  and a durable `status.json`. With Docker Compose this is persisted via a
  named volume; mount it on a persistent disk to retain history across
  restarts.
- Without `SERPER_API_KEY`, `web_search` returns a simulated result (no network
  call), so the prototype runs end-to-end without it.
- `execute_python` is an env-gated opt-in: set `E2B_API_KEY` to run code in an
  isolated [E2B](https://e2b.dev) cloud sandbox; without it the tool returns a
  safe stub (no in-process code execution).
- The rate limiter and plan-approval checkpoint are in-memory, single-instance
  state (like `taskStore`) — they don't coordinate across multiple `web`
  replicas. The durable queue (`REDIS_URL`) fixes this for task *execution*;
  a paused (`awaiting_approval`) task must still be approved against the same
  process/worker that paused it, since LangGraph's checkpoint (`MemorySaver`
  in `lib/agent/graph.ts`) is also in-memory. A persistent checkpointer
  (Postgres/SQLite) would remove that last constraint.
- Deploying to fully serverless environments (where background work is frozen
  after the response) needs the queue/worker above; without it, this
  prototype targets a long-running Node server (local/Docker/VM).

## License

MIT — see [LICENSE](./LICENSE).
