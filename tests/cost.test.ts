import { describe, it, expect } from "vitest";
import {
  costFor,
  addUsage,
  emptyUsageTotals,
  estimateWorstCase,
  pricingFor,
  DEFAULT_PRICING,
  PRICING,
} from "../lib/agent/cost";

describe("pricingFor", () => {
  it("returns known pricing for a recognized model", () => {
    expect(pricingFor("gpt-4o")).toEqual(PRICING["gpt-4o"]);
  });

  it("falls back to DEFAULT_PRICING for an unrecognized model", () => {
    expect(pricingFor("some-future-model")).toEqual(DEFAULT_PRICING);
  });
});

describe("costFor", () => {
  it("computes cost proportional to tokens at the model's per-1M rate", () => {
    const cost = costFor("gpt-4o", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(PRICING["gpt-4o"].inputPerMTok + PRICING["gpt-4o"].outputPerMTok);
  });

  it("returns 0 for 0 tokens", () => {
    expect(costFor("gpt-4o", 0, 0)).toBe(0);
  });
});

describe("addUsage", () => {
  it("accumulates tokens and cost across calls", () => {
    let totals = emptyUsageTotals();
    totals = addUsage(totals, "gpt-4o-mini", { input_tokens: 100, output_tokens: 50, total_tokens: 150 });
    totals = addUsage(totals, "gpt-4o-mini", { input_tokens: 200, output_tokens: 100, total_tokens: 300 });

    expect(totals.inputTokens).toBe(300);
    expect(totals.outputTokens).toBe(150);
    expect(totals.totalTokens).toBe(450);
    expect(totals.calls).toBe(2);
    expect(totals.costUsd).toBeCloseTo(
      costFor("gpt-4o-mini", 100, 50) + costFor("gpt-4o-mini", 200, 100)
    );
  });
});

describe("estimateWorstCase", () => {
  it("derives call counts from the plan-step/attempt bounds", () => {
    const estimate = estimateWorstCase("gpt-4o", 12, 2);
    // 1 planning + 12 * 2 * 2 (exec+verify per attempt) + 1 summary
    expect(estimate.maxCalls).toBe(1 + 12 * 2 * 2 + 1);
    expect(estimate.minCalls).toBe(1 + 12 * 2 + 1);
    expect(estimate.maxCostUsd).toBeGreaterThan(0);
  });

  it("scales cost with the call ceiling", () => {
    const small = estimateWorstCase("gpt-4o", 2, 1);
    const large = estimateWorstCase("gpt-4o", 12, 2);
    expect(large.maxCostUsd).toBeGreaterThan(small.maxCostUsd);
  });
});
