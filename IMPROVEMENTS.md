# Improvement Plan

A consolidated, prioritized backlog for this Manus-style agent prototype
(Next.js App Router + LangChain/LangGraph), produced from a full code review
plus competitive research of the 2026 autonomous-agent landscape.

Items marked **✅ Done** were implemented in the first hardening pass (the
loop/cost + verification + final-output cluster). Everything else is open.

---

## 1. Code review findings

> **Progress:** 24 of 26 findings done or partially done. The only substantive
> item remaining is #6 (full multi-instance durability — status is persisted,
> but a queue/worker is still needed and requires external infra to build and
> verify). A live end-to-end run is also pending an `OPENAI_API_KEY` secret in
> a fresh session.

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
   long-lived instance. **✅ partial:** status is now persisted to a durable
   `status.json` (read back by the API, surviving restarts on a shared volume),
   with the in-memory map kept as a hot-path cache. _Open: queue/worker for
   true multi-instance execution._
7. **Brittle tool-call parsing** — replaced the free-form JSON parsing with
   native `llm.bindTools(...)`: tools are LangChain structured tools with zod
   schemas, the model emits validated `tool_calls`, and `taskId` is injected
   server-side (never exposed to the model), keeping file access workspace-
   scoped. **✅ Done**.
8. **Empty-plan dead end** — an empty plan left the task stuck in `running`.
   Now routes straight to the summary node. **✅ Done**.
9. **Unsafe `response.content as string` casts** — content can be structured
   parts. Centralized in an `asText()` helper. **✅ Done**.
10. **No request limits / rate limiting** — added a 4000-char input cap
    **✅ partial**; _open: real rate limiting._

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
    state endpoint. **✅ partial** (`readPlan()` still unused).
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
| Plans reinvented in circles from weak memory (BabyAGI) | Durable markdown memory; _open: feed completed-step state back into planning (#6)_ |
| Opaque, unpredictable credit burn (top Manus complaint) | _Open: live token/cost meter + pre-run estimate (#4 differentiator)_ |
| Tasks fail mid-stream, no recovery, buckles under load (Manus) | UI error surfacing **✅**; _open: resumable checkpointed runs (#6)_ |
| Benchmark↔reality gap on long multi-file tasks (OpenHands) | Capped, well-scoped plans **✅**; honest scoping |
| No human checkpoints — where everyone derails | _Open: LangGraph `interrupt_before` human-in-the-loop approval_ |
| Insecure / disabled code execution (our stub) | _Open: real sandbox — **E2B** (Firecracker microVMs) or **Daytona** (OSS, self-host, persistent workspaces)_ |

### Features to elevate (adopt from leaders)
- **Streaming, transparent step view** + a **shareable replay** of a run
  (Manus's most-loved feature).
- **Real final deliverable** — done; extend into a downloadable "insight brief".
- **Integrations & persistent workspace** — explicit Manus gaps; the obvious
  wedge for a self-hosted, BYO-key clone.
- **Multi-model / BYO-key** — abstract the hardcoded `gpt-4o` (OpenHands'
  100+ model support is a key OSS draw).

---

## Suggested next batches
- **Batch A (safe cleanup):** #4, #5, #20, #22, #23, #25, #26.
- **Batch B (robustness):** #7 (native tool-calling), #10 (rate limiting),
  #11 (tests), #13 (CI), human-in-the-loop checkpoints.
- **Batch C (architecture):** #6 durability (queue/worker + persistent state),
  real sandbox for `execute_python`, streaming UI.
