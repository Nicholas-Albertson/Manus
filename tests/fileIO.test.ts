import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { resolveTaskPath, readFile, writeFile } from "../lib/agent/tools/fileIO";

describe("resolveTaskPath", () => {
  const taskId = randomUUID();

  it("resolves a path inside the workspace", () => {
    const p = resolveTaskPath(taskId, "notes.md");
    expect(p).toContain(`tasks_data/${taskId}/notes.md`);
  });

  it("blocks traversal out of the workspace", () => {
    expect(() => resolveTaskPath(taskId, "../../../etc/passwd")).toThrow();
    expect(() => resolveTaskPath(taskId, "/etc/passwd")).toThrow();
  });
});

describe("file tools arg validation", () => {
  it("readFile rejects malformed args", async () => {
    expect(await readFile({})).toMatch(/expects/);
    expect(await readFile({ taskId: "x" })).toMatch(/expects/);
  });

  it("writeFile rejects malformed args", async () => {
    expect(await writeFile({ taskId: "x", filePath: "a" })).toMatch(/expects/);
  });

  it("round-trips a write then read", async () => {
    const taskId = randomUUID();
    const write = await writeFile({
      taskId,
      filePath: "out.txt",
      content: "hello world",
    });
    expect(write).toMatch(/written successfully/);
    const read = await readFile({ taskId, filePath: "out.txt" });
    expect(read).toBe("hello world");
  });
});
