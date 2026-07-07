import { describe, it, expect } from "vitest";
import { buildFindingsContext } from "../lib/agent/context";

describe("buildFindingsContext", () => {
  it("returns an empty string when there are no prior findings", () => {
    expect(buildFindingsContext([])).toBe("");
  });

  it("numbers and includes each finding", () => {
    const context = buildFindingsContext(["found A", "found B"]);
    expect(context).toContain("1. found A");
    expect(context).toContain("2. found B");
    expect(context).toContain("Findings from earlier steps so far:");
  });

  it("truncates to the most recent characters when over the limit", () => {
    const findings = ["x".repeat(100), "y".repeat(100)];
    const context = buildFindingsContext(findings, 50);
    expect(context).toContain("[earlier findings truncated");
    expect(context.endsWith("y".repeat(50))).toBe(true);
    expect(context).not.toContain("x");
  });

  it("does not truncate when within the limit", () => {
    const context = buildFindingsContext(["short finding"], 4000);
    expect(context).not.toContain("truncated");
  });
});
