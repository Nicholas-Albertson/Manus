import { describe, it, expect } from "vitest";
import { parsePlan } from "../lib/plan";

describe("parsePlan", () => {
  it("parses checked and unchecked items", () => {
    const md = [
      "# Task Plan",
      "",
      "- [ ] Research options",
      "- [x] Summarize findings",
      "- [X] Deliver result",
    ].join("\n");
    expect(parsePlan(md)).toEqual([
      { done: false, text: "Research options" },
      { done: true, text: "Summarize findings" },
      { done: true, text: "Deliver result" },
    ]);
  });

  it("ignores non-checkbox lines and returns [] for empty input", () => {
    expect(parsePlan("just some prose\n# heading")).toEqual([]);
    expect(parsePlan("")).toEqual([]);
  });
});
