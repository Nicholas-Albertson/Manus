# Improvement Plan

A consolidated, prioritized backlog for this Manus-style agent prototype
(Next.js App Router + LangChain/LangGraph), produced from a full code review
plus competitive research of the 2026 autonomous-agent landscape.

Items marked **✅ Done** were implemented across three hardening passes: the
first (loop/cost + verification + final-output cluster), the second
(durability, rate limiting, cost visibility, human-in-the-loop, multi-model —
"Robustness & durability pass"), and the third ("Batch D pass": persistent
checkpointer, streaming, findings-in-context). Everything else is open.

---

## 1. Code review findings

> **Progress:** 26 of 26 findings done. #6 (durability) now has both a real
> queue/worker option and a persistent (SQLite) LangGraph checkpoint, so a
> paused or in-flight task survives a process restart and can be resumed by
> a different worker than the one that paused it — verified end-to-end
> against a live Redis + BullMQ worker (real OpenAI auth-failure round trip)
> and against a freshly-reimported graph module standing in for a process
> restart (`tests/graph.test.ts`). A live end-to-end *successful* run (not
> just the auth-failure round trip) is still pending a real
> `OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY` secret in a fresh session.

### 🔴 High priority — bugs & security

1. **Path traversal in the file-serving route** — `taskId` was interpolated
   straight into a filesystem path. Now validated against a UUID pattern.
   **✅ Done** (`app/api/agent/[taskId]/files/[fileName]/route.ts`).
2. **Verification node was a no-op** — `FAILURE` was logged but the step
   always advanced; verdict matching was a brittle case-sensitive substring.
   Replaced with an objective leading-token parse and a bounded
   retry-then-skip policy. **✅ Done** (`lib/agent/graph.ts`).
3. **Wrong variable in finding log** — interpolated a raw object
   (`[object Object]`); now uses the stringified result. **✅ Done**.
4. **Duplicate/typo config `tsconfg.json`** — deleted; `moduleResolution`
   aligned to Next's recommended `bundler`; **`strict: true` now enabled** —
   migrated the agent state to LangGraph's typed `Annotation` API so the
   channels/reducers/node returns type-check cleanly. **✅ Done**.
5. **Stray junk file `public/N`** — removed; replaced with a real
   `public/robots.txt`. **✅ Done**.

### 🟠 Medium — architecture & robustness

6. **Fire-and-forget execution + in-memory store is non-durable** — detached
   `agentApp.invoke()` and a `Map`-based `taskStore` only work on a single,
   long-lived instance. **✅ Done:** status is persisted to a durable
   `status.json`, and an optional Redis/BullMQ queue+worker (`REDIS_URL`,
   `lib/queue.ts`, `worker.ts`) replaces the direct in-process invoke, so a
   task run survives an API server restart and can scale across worker
   replicas — verified end-to-end (API → Redis → separate worker process →
   real OpenAI call → failure persisted to `status.json`). Off by default;
   the in-process path is unchanged when `REDIS_URL` is unset. The
   plan-approval LangGraph checkpoint is now also persistent — a SQLite file
   (`lib/agent/checkpointer.ts`) on the same shared volume as task artifacts
   — so a paused task can be approved after a restart or by a different
   worker process than the one that paused it. **✅ Done.**
7. **Brittle tool-call parsing** — replaced the free-form JSON parsing with
   native `llm.bindTools(...)`: tools are LangChain structured tools with zod
   schemas, the model emits validated `tool_calls`, and `taskId` is injected
   server-side (never exposed to the model), keeping file access workspace-
   scoped. **✅ Done**.
8. **Empty-plan dead end** — an empty plan left the task stuck in `running`.
   Now routes straight to the summary node. **✅ Done**.
9. **Unsafe `response.content as string` casts** — content can be structured
   parts. Centralized in an `asText()` helper. **✅ Done**.
10. **No request limits / rate limiting** — added a 4000-char input cap, and
    now a real per-IP sliding-window rate limiter on task creation
    (`lib/rateLimit.ts`, `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`, 429 +
    `Retry-After`). **✅ Done.**

### 🟡 Lower — quality, DX, polish

11. **No tests** — added a Vitest suite (16 tests) covering `resolveTaskPath`
    traversal, `parsePlan`, `asText`, `isValidTaskId`, tool arg schemas, and a
    file round-trip. **✅ Done**.
12. **No error surfacing in UI** — failures only hit `console.error`. Added an
    error banner + final-output panel. **✅ Done** (`app/page.tsx`).
13. **No CI** — added `.github/workflows/ci.yml` running `npm ci`, lint, tests,
    and build on every push/PR. **✅ Done**.
14. **Inconsistent naming** — `manus-js-clone` vs "Taskflow" vs "Manus Clone".
    User-facing surfaces standardized on **Taskflow** (layout metadata + UI).
    **✅ partial** (package name left as-is to avoid churn).
15. **Stale Vercel comments** contradict the README — cleaned up in `store.ts`
    and `memory.ts`. **✅ Done**.
16. **`execute_python` was a permanent stub** — now an env-gated opt-in: with
    `E2B_API_KEY` set it runs code in an isolated E2B cloud sandbox; without it,
    it falls back to the safe stub. **✅ Done** (live path requires an E2B key
    to exercise; the fallback is unit-tested). _Daytona was evaluated as a
    self-hosted alternative and deliberately not added — see the Batch D pass
    below for why._
17. **Missing `LICENSE`** — added MIT `LICENSE`; README now documents the
    `SERPER_API_KEY` fallback and a full scripts table. **✅ Done**.
18. **Unbounded plan crashed the graph** — default `recursionLimit` (25) threw
    `GraphRecursionError` past ~12 steps. Added explicit `MAX_PLAN_STEPS`,
    `MAX_STEP_ATTEMPTS`, and a computed `RECURSION_LIMIT`. **✅ Done**.
19. **Final output was never produced** — `finalOutput` was declared but never
    written. Added a synthesis node that emits an executive summary to
    `summary.md` and the UI (now rendered as markdown). **✅ Done**.
20. **Dead code in `memory.ts`** — `getAllFiles()` now backs the aggregated
    state endpoint; the unused `readPlan()` was removed. **✅ Done.**
21. **Chatty polling (N+1)** — replaced 4–5 requests/tick with a single
    `GET /api/agent/[taskId]` returning status + all docs, then superseded by
    a Server-Sent Events stream (`GET /api/agent/[taskId]/stream`) that pushes
    updates the moment the task's on-disk state changes, instead of polling
    on any fixed interval. **✅ Done**.
22. **Drop the `uuid` dependency** — replaced with Node's `crypto.randomUUID()`;
    removed `uuid` + `@types/uuid`. **✅ Done**.
23. **No `engines` field** — added `"node": ">=20"`. **✅ Done**.
24. **Accessibility gaps** — labeled textarea, `aria-live` status region,
    `role="progressbar"` on the plan bar, `role="alert"` errors, keyboard
    submit (⌘/Ctrl+Enter). **✅ Done**.
25. **`tsconfig` drift** — resolved by deleting the typo file, setting
    `moduleResolution: bundler`, and enabling `strict: true` (see #4).
    **✅ Done**.
26. **No `metadataBase`** in `layout.tsx` — added, with full OpenGraph/title
    template metadata and a `viewport` export. **✅ Done**.

### Site / frontend overhaul (this pass)
- Full visual redesign: sticky header + branding, gradient hero, composer with
  example chips, char counter, and keyboard submit.
- **Markdown rendering** of the final output and findings via `react-markdown`
  + `remark-gfm` + `@tailwindcss/typography` (replacing raw `<pre>` dumps).
- **Parsed plan checklist** with a live progress bar (driven by the
  `- [x]` / `- [ ]` markers the agent writes).
- Tabbed Findings / Progress activity panel, status pill with animated live
  indicator, loading/empty states, and Copy / Download for the result.
- Refined dark theme, custom scrollbars, system font stack (no external font
  fetch, keeping the build hermetic).

### Infrastructure expansion (this pass)
- **Durable status:** `status.json` written per task (pending/running/
  completed/failed + error + timestamps), read back by the API so status
  survives process restarts; in-memory map kept as a hot-path cache.
- **Failure surfacing:** agent errors persist a `failed` status with the
  message, shown in the UI.
- **Test suite:** Vitest with 16 unit tests; `npm test` script.
- **CI:** GitHub Actions running lint + tests + build on push/PR.
- **DRY refactors:** shared `lib/taskId.ts`, `lib/agent/text.ts`, `lib/plan.ts`
  (used by both UI and API, and unit-tested).
- **Hygiene:** removed `uuid` (→ `crypto.randomUUID`), deleted `tsconfg.json`
  and `public/N`, added `engines`, MIT `LICENSE`, `robots.txt`, and refreshed
  the README.

### Robustness & durability pass (this pass)
Closed out the remaining Batch B/C backlog and several competitive-landscape
differentiators:
- **Real rate limiting:** per-IP sliding-window limiter on task creation
  (`lib/rateLimit.ts`), 429 + `Retry-After`, configurable via
  `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`.
- **Multi-model / BYO-key:** `lib/agent/llm.ts` picks OpenAI or Anthropic
  based on which key (or `LLM_PROVIDER`) is set — every node calls the same
  `getLlm()` instead of a hardcoded `ChatOpenAI`.
- **Token/cost visibility:** every LLM call's `usage_metadata` is recorded
  per task (`lib/agent/cost.ts`, `usage.json`), exposed via the status API,
  and shown live in the UI alongside a worst-case pre-run cost estimate
  (`/api/config`) derived from the deterministic step/attempt bounds —
  directly answers the "opaque, unpredictable credit burn" complaint below.
- **Human-in-the-loop plan approval:** opt-in (`REQUIRE_PLAN_APPROVAL=true`)
  LangGraph `interruptBefore` checkpoint that pauses the graph right after
  planning — before any execution step or tool call — until an explicit
  approve/reject call resumes or cancels it (`app/api/agent/[taskId]/
  approve|reject`). Verified end-to-end with a mocked LLM
  (`tests/graph.test.ts`): pause, correct status, resume, completion.
- **Durable queue/worker:** optional Redis/BullMQ queue (`REDIS_URL`) with a
  standalone `worker.ts` process, wired through `docker-compose.yml`'s
  `durable` profile. Verified against a real local Redis: enqueue → separate
  worker process dequeues → calls the real OpenAI API → failure is caught and
  persisted to `status.json`, all through the actual HTTP API.
- **Dead code removed:** `MemoryFileManager.readPlan()`.
- Test suite grew from 16 to 46 tests, including a real (non-mocked) Redis
  integration test and a full mocked-LLM graph run (both pause/resume and
  straight-through paths).

### Batch D pass (this pass)
- **Persistent LangGraph checkpointer:** swapped `MemorySaver` for
  `SqliteSaver` (`@langchain/langgraph-checkpoint-sqlite`) backed by a file
  on the same `/tmp/tasks_data` root as task artifacts
  (`lib/agent/checkpointer.ts`, `CHECKPOINT_DB_PATH`). Closes the last
  durability gap from #6: a task paused at plan-approval now survives a
  process restart and can be resumed by a different process than the one
  that paused it (both `web` and `worker` already share that volume). Proven
  with a test that pauses under one dynamically-imported `agentApp`
  instance, fully drops the module cache (`vi.resetModules()` — including the
  module-level checkpointer singleton), re-imports fresh, and resumes to
  completion from the second instance — about as close as a same-process
  test can get to "a different process resumes it."
- **Streaming step view:** `GET /api/agent/[taskId]/stream` (SSE) replaces
  client-side polling. The server polls the task's on-disk files every 500ms
  and only pushes a message when the serialized snapshot actually changed,
  closing the connection itself once the task reaches a terminal status.
  Verified live: a manually-simulated task produced exactly one SSE message
  per real state change (initial state, plan write, completion) with no
  extra/spurious messages. The client falls back to a one-shot poll of the
  existing `GET /api/agent/[taskId]` on any SSE connection error.
- **Findings fed into later steps:** the reinterpreted, cost-bounded version
  of "feed completed-step state back into planning" — rather than adding a
  new re-planning LLM call (which would break the provable call-count bound),
  each execution step's prompt now includes a bounded summary of prior
  steps' findings (`lib/agent/context.ts`, capped at 4000 chars, keeping the
  most recent). No new LLM calls; later steps just stop working blind.
  Verified with a mocked two-step run asserting step 2's prompt contains
  step 1's finding and step 1's prompt doesn't (nothing to include yet).
- **Daytona evaluated, not added:** both `@daytonaio/sdk` and its renamed
  successor `@daytona/sdk` pull in a full OpenTelemetry exporter stack
  whose `protobufjs` transitive dependency has several high-severity
  advisories with no fix available — installing it took this repo from 0 to
  27 `npm audit` findings. A hand-rolled REST client would sidestep that, but
  there's no Daytona credential available in this environment to verify one
  against the real API, and shipping an unverified integration isn't worth
  the risk of it silently being broken. E2B remains the supported sandbox.
- Test suite grew from 46 to 75 tests.

---

## 2. Competitive landscape & guardrails (2026)

Research across Manus, Genspark, Flowith, Devin, OpenHands, AutoGPT/BabyAGI,
and the LangGraph/CrewAI frameworks. The clearest signal: **the field's most
common failures map directly onto this repo's latent bugs.** Designing around
them is both bug-fixing and differentiation.

| Competitor weakness (documented) | Our guardrail |
|---|---|
| Runaway loops & "$80 overnight" API bills (AutoGPT/BabyAGI) | Hard `MAX_PLAN_STEPS`, `MAX_STEP_ATTEMPTS`, computed `RECURSION_LIMIT` → provable upper bound on LLM calls **✅** |
| Subjective NL "is it done?" defaulting to "more work" | Objective leading-token verdict + bounded retry-then-skip **✅** |
| Plans reinvented in circles from weak memory (BabyAGI) | Durable markdown memory **✅**; prior steps' findings fed into each later step's prompt **✅** (`lib/agent/context.ts`) — the cost-bounded version of "feed state back into planning" (no new LLM calls) |
| Opaque, unpredictable credit burn (top Manus complaint) | Live token/cost meter + worst-case pre-run estimate **✅** (`lib/agent/cost.ts`) |
| Tasks fail mid-stream, no recovery, buckles under load (Manus) | UI error surfacing **✅**; optional durable queue/worker for resumable runs **✅** (`REDIS_URL`); persistent checkpointer for cross-process plan-approval resume **✅** (`lib/agent/checkpointer.ts`) |
| Benchmark↔reality gap on long multi-file tasks (OpenHands) | Capped, well-scoped plans **✅**; honest scoping |
| No human checkpoints — where everyone derails | Opt-in LangGraph `interruptBefore` plan-approval checkpoint **✅** (`REQUIRE_PLAN_APPROVAL`) |
| Insecure / disabled code execution (our stub) | E2B sandbox opt-in **✅**; Daytona evaluated and deliberately not added (see Batch D pass — vulnerable transitive deps, unverifiable without credentials) |

### Features to elevate (adopt from leaders)
- **Streaming, transparent step view** — **✅ Done**: `GET /api/agent/[taskId]/stream`
  (SSE) pushes updates as the task's on-disk state changes. _Still open: a
  **shareable replay** of a completed run_ (Manus's most-loved feature) —
  the durable artifacts (`task_plan.md`, `findings.md`, `progress.md`,
  `summary.md`) already contain everything a replay view would need; this is
  now purely a UI/routing feature (e.g. a public read-only `/tasks/[taskId]`
  page), not a data-model gap.
- **Real final deliverable** — done; extend into a downloadable "insight brief".
- **Integrations & persistent workspace** — explicit Manus gaps; the obvious
  wedge for a self-hosted, BYO-key clone. Still open — genuinely open-ended
  (which integrations, what "persistent workspace" means beyond the existing
  per-task file workspace) and needs product direction, not just engineering.
- **Multi-model / BYO-key** — **✅ Done** (`lib/agent/llm.ts`: OpenAI or
  Anthropic based on which key is set).

---

## Suggested next batches
- **Batch A (safe cleanup):** done — #4, #5, #20, #22, #23, #25, #26.
- **Batch B (robustness):** done — #7 (native tool-calling), #10 (rate
  limiting), #11 (tests), #13 (CI), human-in-the-loop checkpoints.
- **Batch C (architecture):** done — #6 durability (queue/worker), real
  sandbox for `execute_python`.
- **Batch D:** done — persistent LangGraph checkpointer, streaming step
  view, findings fed into later steps' prompts. Daytona evaluated and
  deliberately not added (dependency-vulnerability tradeoff).
- **Batch E (next up, needs product direction more than engineering):**
  shareable/replayable run view (public read-only page over the existing
  durable artifacts); integrations & persistent workspace (undefined scope —
  needs a decision on which integrations and what "persistent" means beyond
  per-task files); a self-hosted sandbox alternative to E2B, if one can be
  wired without the dependency-vulnerability tradeoff Daytona's current SDK
  brings (e.g. a minimal hand-rolled REST client, verified against a real
  account).
