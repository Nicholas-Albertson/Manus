# Taskflow (JS) — Working Prototype

Taskflow is a minimal Manus-style agent prototype built with Next.js (App
Router) + LangChain/LangGraph. Give it a goal; it plans the steps, executes
them with tools, verifies each result, and delivers a consolidated answer.

## Requirements

- Node.js 20+
- An LLM API key: `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`

## Local run

```bash
cp .env.local.example .env.local
# edit .env.local and set OPENROUTER_API_KEY (or ANTHROPIC_API_KEY)

npm ci
npm run dev
```

Open `http://localhost:3000`.

## Configuration

All variables are optional except one LLM key. See `.env.local.example` for
the full list with defaults; the highlights:

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` | At least one is required. `OPENROUTER_API_KEY` authenticates against [OpenRouter](https://openrouter.ai)'s OpenAI-compatible API. `LLM_PROVIDER=openai\|anthropic` forces a choice when both are set (OpenAI/OpenRouter wins by default). |
| `OPENAI_MODEL` / `ANTHROPIC_MODEL` | Override the default model per provider. `OPENAI_MODEL` uses OpenRouter's `vendor/model` slug format (e.g. `openai/gpt-4o`). |
| `SERPER_API_KEY` | Enables real `web_search` results; without it, a simulated result is returned. |
| `E2B_API_KEY` | Enables real sandboxed `execute_python` via [E2B](https://e2b.dev); without it, the tool returns a safe stub. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Per-IP task-creation rate limit. Defaults to 10 tasks / 10 minutes. |
| `REQUIRE_PLAN_APPROVAL` | Set `true` to pause after planning and require an explicit approve/reject before any execution step or tool call runs. Off by default. |
| `REDIS_URL` | Enables the durable Redis/BullMQ queue+worker instead of direct in-process execution. Unset by default. |
| `CHECKPOINT_DB_PATH` | Where the LangGraph checkpoint SQLite file lives. Defaults to `/tmp/tasks_data/checkpoints.db` (same volume as task artifacts); mainly useful to override in tests. |

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
OPENROUTER_API_KEY=...
# optional:
OPENAI_MODEL=openai/gpt-4o
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
   `read_file`, `write_file`). Each step's prompt also includes a bounded
   summary of prior steps' findings (`lib/agent/context.ts`), so later steps
   build on earlier ones instead of working blind — at no extra LLM-call cost.
4. **Verify** — each step is checked; failures retry a bounded number of times,
   then skip so a single hard step can't stall the run.
5. **Summarize** — a final synthesis step writes a consolidated answer.

Execution is deterministically bounded (`MAX_PLAN_STEPS`, `MAX_STEP_ATTEMPTS`,
`RECURSION_LIMIT` in `lib/agent/limits.ts`), giving a provable upper bound on
LLM calls per run — no runaway loops or surprise bills. The UI shows this
bound as a worst-case cost estimate before you run anything, and a live
running token/cost total once a task starts (`lib/agent/cost.ts`).

The UI (`app/page.tsx`) subscribes to `GET /api/agent/[taskId]/stream`, a
Server-Sent Events endpoint (`app/api/agent/[taskId]/stream/route.ts`) that
pushes a message the moment the task's on-disk state changes — status
transitions, each new finding, plan checkboxes — instead of polling on a
fixed interval. It works the same way regardless of whether the task is
running in-process or in a separate durable-queue worker, since both only
ever communicate through those same on-disk files.

## Notes / limitations

- Task artifacts are written to `/tmp/tasks_data/<taskId>/`:
  `task_plan.md`, `findings.md`, `progress.md`, `summary.md`, `usage.json`,
  and a durable `status.json`. The LangGraph checkpoint DB
  (`/tmp/tasks_data/checkpoints.db`) lives on the same root. With Docker
  Compose this is persisted via a named volume; mount it on a persistent disk
  to retain history (and resumable paused tasks) across restarts.
- Without `SERPER_API_KEY`, `web_search` returns a simulated result (no network
  call), so the prototype runs end-to-end without it.
- `execute_python` is an env-gated opt-in: set `E2B_API_KEY` to run code in an
  isolated [E2B](https://e2b.dev) cloud sandbox; without it the tool returns a
  safe stub (no in-process code execution).
- The rate limiter and `taskStore` hot-path cache are in-memory,
  single-instance state — they don't coordinate across multiple `web`
  replicas (the rate limit is per-replica, and `taskStore` is just a cache in
  front of the durable `status.json`, so that part is harmless). The
  LangGraph checkpoint that backs plan-approval pause/resume, by contrast,
  *is* persistent — it's a SQLite file (`lib/agent/checkpointer.ts`,
  `CHECKPOINT_DB_PATH`) on the same shared volume as task artifacts, so a
  paused task can be approved after a `web`/`worker` restart, or by a
  different worker process than the one that paused it.
- `execute_python`'s sandbox is E2B-only for now. A self-hosted Daytona
  alternative was evaluated and deliberately not added: the `@daytona/sdk`
  package pulls in an OpenTelemetry stack with a transitively vulnerable
  `protobufjs` (multiple high-severity advisories, no fix available at time
  of writing), which would have taken this repo from 0 to 27 `npm audit`
  findings. A hand-rolled REST client would avoid that, but wasn't safe to
  ship unverified against Daytona's real API without credentials to test it
  in this environment.
- Deploying to fully serverless environments (where background work is frozen
  after the response) needs the queue/worker above; without it, this
  prototype targets a long-running Node server (local/Docker/VM).

## License

MIT — see [LICENSE](./LICENSE).
