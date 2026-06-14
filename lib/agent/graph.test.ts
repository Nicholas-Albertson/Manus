import { describe, it, expect } from "vitest";
import {
  parsePlan,
  parseToolCall,
  parseVerdict,
  decideVerification,
  routeAfterStep,
  asText,
  MAX_PLAN_STEPS,
  MAX_STEP_ATTEMPTS,
  RECURSION_LIMIT,
} from "./graph";
import type { AgentState } from "./state";

describe("asText", () => {
  it("passes through a plain string", () => {
    expect(asText("hello")).toBe("hello");
  });

  it("concatenates structured content parts", () => {
    expect(
      asText([{ type: "text", text: "a" }, "b", { type: "text", text: "c" }])
    ).toBe("abc");
  });

  it("coerces nullish content to an empty string", () => {
    expect(asText(null)).toBe("");
    expect(asText(undefined)).toBe("");
  });
});

describe("parsePlan", () => {
  it("keeps only dash-prefixed lines and strips the marker", () => {
    const content = "Here is the plan:\n- Research X\n- Summarize Y\nthanks!";
    expect(parsePlan(content)).toEqual(["Research X", "Summarize Y"]);
  });

  it("drops blank steps", () => {
    expect(parsePlan("- a\n-   \n- b")).toEqual(["a", "b"]);
  });

  it("caps the number of steps at the provided maximum", () => {
    const content = Array.from({ length: 20 }, (_, i) => `- step ${i}`).join("\n");
    expect(parsePlan(content, 3)).toHaveLength(3);
  });

  it("defaults the cap to MAX_PLAN_STEPS", () => {
    const content = Array.from({ length: 50 }, (_, i) => `- step ${i}`).join("\n");
    expect(parsePlan(content)).toHaveLength(MAX_PLAN_STEPS);
  });
});

describe("parseToolCall", () => {
  const registry = { web_search: () => {}, write_file: () => {} };

  it("parses a bare JSON tool call", () => {
    expect(
      parseToolCall('{"tool":"web_search","arguments":{"query":"cats"}}', registry)
    ).toEqual({ kind: "tool", tool: "web_search", arguments: { query: "cats" } });
  });

  it("tolerates a fenced ```json block", () => {
    const content = '```json\n{"tool":"web_search","arguments":{"query":"x"}}\n```';
    expect(parseToolCall(content, registry)).toEqual({
      kind: "tool",
      tool: "web_search",
      arguments: { query: "x" },
    });
  });

  it("defaults arguments to an empty object when omitted", () => {
    expect(parseToolCall('{"tool":"web_search"}', registry)).toEqual({
      kind: "tool",
      tool: "web_search",
      arguments: {},
    });
  });

  it("treats an unknown tool name as plain text", () => {
    expect(parseToolCall('{"tool":"rm_rf","arguments":{}}', registry)).toEqual({
      kind: "text",
    });
  });

  it("treats malformed JSON as plain text", () => {
    expect(parseToolCall("not json at all", registry)).toEqual({ kind: "text" });
  });

  it("treats JSON without a tool field as plain text", () => {
    expect(parseToolCall('{"foo":"bar"}', registry)).toEqual({ kind: "text" });
  });
});

describe("parseVerdict", () => {
  it("accepts a leading SUCCESS token, case-insensitively", () => {
    expect(parseVerdict("SUCCESS - looks good")).toBe(true);
    expect(parseVerdict("  success: fine")).toBe(true);
  });

  it("rejects FAILURE and empty verdicts", () => {
    expect(parseVerdict("FAILURE - nope")).toBe(false);
    expect(parseVerdict("")).toBe(false);
  });

  it("does not match SUCCESS appearing later in the text", () => {
    expect(parseVerdict("The step was a SUCCESS")).toBe(false);
  });
});

describe("decideVerification", () => {
  it("advances and resets attempts on success", () => {
    expect(decideVerification(true, 3, 0)).toEqual({
      outcome: "advance",
      currentStepIndex: 4,
      stepAttempts: 0,
    });
  });

  it("retries the same step on the first failure", () => {
    expect(decideVerification(false, 3, 0)).toEqual({
      outcome: "retry",
      currentStepIndex: 3,
      stepAttempts: 1,
    });
  });

  it("skips the step once attempts reach MAX_STEP_ATTEMPTS", () => {
    expect(decideVerification(false, 3, MAX_STEP_ATTEMPTS - 1)).toEqual({
      outcome: "skip",
      currentStepIndex: 4,
      stepAttempts: 0,
    });
  });
});

describe("routeAfterStep", () => {
  const state = (currentStepIndex: number, planLen: number): AgentState =>
    ({
      currentStepIndex,
      plan: Array.from({ length: planLen }, (_, i) => `step ${i}`),
    } as AgentState);

  it("routes to execution while steps remain", () => {
    expect(routeAfterStep(state(0, 3))).toBe("execution");
    expect(routeAfterStep(state(2, 3))).toBe("execution");
  });

  it("routes to summary once the plan is exhausted", () => {
    expect(routeAfterStep(state(3, 3))).toBe("summary");
  });

  it("routes an empty plan straight to summary", () => {
    expect(routeAfterStep(state(0, 0))).toBe("summary");
  });
});

describe("guardrail constants", () => {
  it("computes RECURSION_LIMIT above the worst-case path", () => {
    const worstCasePath = 2 + MAX_PLAN_STEPS * MAX_STEP_ATTEMPTS * 2 + 4;
    expect(RECURSION_LIMIT).toBe(worstCasePath);
    expect(RECURSION_LIMIT).toBeGreaterThan(MAX_PLAN_STEPS * MAX_STEP_ATTEMPTS);
  });
});
