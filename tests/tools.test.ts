import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executePython } from "../lib/agent/tools/pythonExec";
import { webSearch } from "../lib/agent/tools/websearch";

describe("executePython", () => {
  const original = process.env.E2B_API_KEY;
  beforeEach(() => {
    delete process.env.E2B_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = original;
  });

  it("falls back to a safe stub when no E2B_API_KEY is set", async () => {
    const out = await executePython({ code: "print(1)" });
    expect(out).toMatch(/disabled/i);
    expect(out).toMatch(/E2B_API_KEY/);
    expect(out).toContain("print(1)");
  });

  it("rejects malformed args", async () => {
    expect(await executePython({})).toMatch(/expects/);
  });
});

describe("webSearch", () => {
  const original = process.env.SERPER_API_KEY;
  beforeEach(() => {
    delete process.env.SERPER_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = original;
  });

  it("returns a simulated result with no API key (no network)", async () => {
    const out = await webSearch({ query: "test query" });
    expect(out).toMatch(/Simulated/);
    expect(out).toContain("test query");
  });

  it("rejects malformed args", async () => {
    expect(await webSearch({})).toMatch(/expects/);
  });
});
