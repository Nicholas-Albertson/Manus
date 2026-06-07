# Improvement Plan

A consolidated, prioritized backlog for this Manus-style agent prototype
(Next.js App Router + LangChain/LangGraph), produced from a full code review
plus competitive research of the 2026 autonomous-agent landscape.

Items marked **✅ Done** were implemented in the first hardening pass (the
loop/cost + verification + final-output cluster). Everything else is open.

---

## 1. Code review findings

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
4. **Duplicate/typo config `tsconfg.json`** — dead file that conflicts with
   `tsconfig.json` (differing `strict` / `moduleResolution`). _Open: delete
   it and enable `strict: true` in the real config._
5. **Stray junk file `public/N`** — 1-byte accidental artifact. _Open: remove._

### 🟠 Medium — architecture & robustness

6. **Fire-and-forget execution + in-memory store is non-durable** — detached
   `agentApp.invoke()` and a `Map`-based `taskStore` only work on a single,
   long-lived instance. _Open: queue/worker + persistent status; the markdown
   files are the real source of truth, so `taskStore` is the weak link._
7. **Brittle tool-call parsing** — relies on the LLM emitting raw JSON. Made
   tolerant of ```` ```json ```` fences as a stopgap **✅ partial**; _open:
   move to native `llm.bindTools(...)`._
8. **Empty-plan dead end** — an empty plan left the task stuck in `running`.
   Now routes straight to the summary node. **✅ Done**.
9. **Unsafe `response.content as string` casts** — content can be structured
   parts. Centralized in an `asText()` helper. **✅ Done**.
10. **No request limits / rate limiting** — added a 4000-char input cap
    **✅ partial**; _open: real rate limiting._

### 🟡 Lower — quality, DX, polish

11. **No tests** — _open: unit-test `resolveTaskPath`, the tool-call parser,
    arg schemas, and the verification retry/skip logic._
12. **No error surfacing in UI** — failures only hit `console.error`. Added an
    error banner + final-output panel. **✅ Done** (`app/page.tsx`).
13. **No CI** — _open: GitHub Actions running `lint` + `build` (+ tests)._
14. **Inconsistent naming** — `manus-js-clone` vs "Taskflow" vs "Manus Clone".
    User-facing surfaces standardized on **Taskflow** (layout metadata + UI).
    **✅ partial** (package name left as-is to avoid churn).
15. **Stale Vercel comments** contradict the README. _Open: clean up._
16. **`execute_python` is a permanent stub** — _open: wire a real sandbox
    (see §2) or drop it from the advertised tool list._
17. **Missing `LICENSE`**; README env table should note `SERPER_API_KEY` is
    optional. _Open._
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
22. **Drop the `uuid` dependency** — Node 20 has `crypto.randomUUID()`. _Open._
23. **No `engines` field** in `package.json`. _Open: `"node": ">=20"`._
24. **Accessibility gaps** — labeled textarea, `aria-live` status region,
    `role="progressbar"` on the plan bar, `role="alert"` errors, keyboard
    submit (⌘/Ctrl+Enter). **✅ Done**.
25. **`tsconfig` drift** — `moduleResolution` differs between the two files;
    Next recommends `bundler`. _Open (folds into #4)._
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
