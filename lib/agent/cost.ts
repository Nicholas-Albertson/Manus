// Pure token/cost accounting — no filesystem or network access, so it's safe
// to import from both server code (usage persistence) and client components
// (the pre-run worst-case estimate).
import { MAX_PLAN_STEPS, MAX_STEP_ATTEMPTS } from "./limits";

export interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  inputPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTok: number;
}

// Indicative list pricing (USD / 1M tokens) for the models this app is most
// likely to be configured with. Prices drift over time — this powers a
// rough, clearly-labeled estimate, not a billing-accurate quote. Unknown
// models fall back to DEFAULT_PRICING.
export const PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4.1": { inputPerMTok: 2, outputPerMTok: 8 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
  "gpt-4.1-nano": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  "o3": { inputPerMTok: 2, outputPerMTok: 8 },
  "o4-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4 },
  "claude-sonnet-4-5": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-4-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

export const DEFAULT_PRICING: ModelPricing = { inputPerMTok: 3, outputPerMTok: 15 };

export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? DEFAULT_PRICING;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

export function emptyUsageTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 };
}

export function costFor(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = pricingFor(model);
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export function addUsage(totals: UsageTotals, model: string, usage: LlmUsage): UsageTotals {
  return {
    inputTokens: totals.inputTokens + usage.input_tokens,
    outputTokens: totals.outputTokens + usage.output_tokens,
    totalTokens: totals.totalTokens + usage.total_tokens,
    costUsd: totals.costUsd + costFor(model, usage.input_tokens, usage.output_tokens),
    calls: totals.calls + 1,
  };
}

export interface CostEstimate {
  /** LLM calls if every step succeeds on the first attempt. */
  minCalls: number;
  /** LLM calls if every step exhausts its retries (the hard ceiling). */
  maxCalls: number;
  /** Dollar cost at the call ceiling, assuming avgInputTokens/avgOutputTokens per call. */
  maxCostUsd: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

/**
 * Worst-case cost ceiling derived from the deterministic bounds in
 * limits.ts. This is intentionally conservative (assumes every step retries
 * once) and uses rough average-call token sizes — it tells a user "you will
 * never be charged more than about $X for this run," not an exact quote.
 */
export function estimateWorstCase(
  model: string,
  maxPlanSteps: number = MAX_PLAN_STEPS,
  maxStepAttempts: number = MAX_STEP_ATTEMPTS,
  avgInputTokens = 600,
  avgOutputTokens = 300
): CostEstimate {
  const maxCalls = 1 /* planning */ + maxPlanSteps * maxStepAttempts * 2 /* exec + verify */ + 1 /* summary */;
  const minCalls = 1 + maxPlanSteps * 2 + 1;
  const perCallCost = costFor(model, avgInputTokens, avgOutputTokens);
  return {
    minCalls,
    maxCalls,
    maxCostUsd: perCallCost * maxCalls,
    avgInputTokens,
    avgOutputTokens,
  };
}
