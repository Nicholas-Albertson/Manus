# Improvement Plan

A consolidated, prioritized backlog for this Manus-style agent prototype
(Next.js App Router + LangChain/LangGraph), produced from a full code review
plus competitive research of the 2026 autonomous-agent landscape.

Items marked **✅ Done** were implemented across two hardening passes: the
first (loop/cost + verification + final-output cluster), and a second
(durability, rate limiting, cost visibility, human-in-the-loop, multi-model —
see "Robustness & durability pass" below). Everything else is open.

---

## 1. Code review findings

> **Progress:** 26 of 26 findings done or partially done. #6 (durability) now
> has a real queue/worker option (verified end-to-end against a live Redis +
> BullMQ worker + a real OpenAI auth-failure round trip); the remaining gap is
> a persistent LangGraph checkpointer for multi-instance plan-approval resume
> (currently in-memory, see the Robustness pass below). A live end-to-end
> *successful* run (not just the auth-failure round trip) is still pending a
> real `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` secret in a fresh session.

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
   the in-process path is unchanged when `REDIS_URL` is unset. _Residual gap:
   the plan-approval checkpoint (`MemorySaver` in `lib/agent/graph.ts`) is
   still in-memory, so a paused task must be approved against the same
   process that paused it — a persistent checkpointer would remove that._
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
    to exercise; the fallback is unit-tested). _Daytona remains an alternative
    if self-hosting is preferred._
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
    `GET /api/agent/[taskId]` returning status + all docs. **✅ Done**
    (streaming still a future option).
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
| Plans reinvented in circles from weak memory (BabyAGI) | Durable markdown memory; _open: feed completed-step state back into planning_ |
| Opaque, unpredictable credit burn (top Manus complaint) | Live token/cost meter + worst-case pre-run estimate **✅** (`lib/agent/cost.ts`) |
| Tasks fail mid-stream, no recovery, buckles under load (Manus) | UI error surfacing **✅**; optional durable queue/worker for resumable runs **✅** (`REDIS_URL`); _open: persistent checkpointer for multi-instance plan-approval resume_ |
| Benchmark↔reality gap on long multi-file tasks (OpenHands) | Capped, well-scoped plans **✅**; honest scoping |
| No human checkpoints — where everyone derails | Opt-in LangGraph `interruptBefore` plan-approval checkpoint **✅** (`REQUIRE_PLAN_APPROVAL`) |
| Insecure / disabled code execution (our stub) | E2B sandbox opt-in **✅**; _open: Daytona as a self-hosted alternative_ |

### Features to elevate (adopt from leaders)
- **Streaming, transparent step view** + a **shareable replay** of a run
  (Manus's most-loved feature) — still open; current UI polls every 2s and
  shows a live progress log, which covers "transparent" but not true
  streaming or replay.
- **Real final deliverable** — done; extend into a downloadable "insight brief".
- **Integrations & persistent workspace** — explicit Manus gaps; the obvious
  wedge for a self-hosted, BYO-key clone. Still open.
- **Multi-model / BYO-key** — **✅ Done** (`lib/agent/llm.ts`: OpenAI or
  Anthropic based on which key is set).

---

## Suggested next batches
- **Batch A (safe cleanup):** done — #4, #5, #20, #22, #23, #25, #26.
- **Batch B (robustness):** done — #7 (native tool-calling), #10 (rate
  limiting), #11 (tests), #13 (CI), human-in-the-loop checkpoints.
- **Batch C (architecture):** done — #6 durability (queue/worker), real
  sandbox for `execute_python`. _Open: streaming UI._
- **Batch D (next up):** persistent LangGraph checkpointer (removes the last
  in-memory constraint on plan-approval resume across instances); streaming
  step view + shareable run replay; feed completed-step state back into
  planning; Daytona as a self-hosted `execute_python` alternative;
  integrations / persistent workspace.
