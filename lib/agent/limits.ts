// Deterministic execution bounds, split out from graph.ts so lightweight
// consumers (e.g. the /api/config route used for the pre-run cost estimate)
// don't have to import the full LangGraph workflow just to read a constant.
//
// These bound total work (and therefore token spend) deterministically, which
// is the single most common failure mode of autonomous agents: unbounded
// loops and runaway API bills. The maximum number of LLM calls for a run is
// 1 (plan) + MAX_PLAN_STEPS * MAX_STEP_ATTEMPTS * 2 (exec+verify) + 1 (summary).
export const MAX_PLAN_STEPS = 12;
export const MAX_STEP_ATTEMPTS = 2; // 1 initial try + up to 1 retry per step
// LangGraph counts supersteps; set generously above the worst-case path so a
// legitimate long run never trips it, while a runaway cycle still terminates.
export const RECURSION_LIMIT =
  2 + MAX_PLAN_STEPS * MAX_STEP_ATTEMPTS * 2 + 4;
