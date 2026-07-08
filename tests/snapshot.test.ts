import { describe, it, expect, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getTaskSnapshot, TERMINAL_STATUSES } from "../lib/agent/snapshot";
import { MemoryFileManager } from "../lib/agent/memory";

describe("getTaskSnapshot", () => {
  const createdTaskIds: string[] = [];

  afterEach(async () => {
    for (const id of createdTaskIds.splice(0)) {
      await fs.rm(path.join("/tmp", "tasks_data", id), { recursive: true, force: true });
    }
  });

  it("defaults to pending status for an unknown task with no files yet", async () => {
    const taskId = randomUUID();
    createdTaskIds.push(taskId);

    const snapshot = await getTaskSnapshot(taskId);
    expect(snapshot.status).toBe("pending");
    expect(snapshot.plan).toBe("");
    expect(snapshot.usage.calls).toBe(0);
  });

  it("reflects durable status and written artifacts", async () => {
    const taskId = randomUUID();
    createdTaskIds.push(taskId);
    const memory = new MemoryFileManager(taskId);
    await memory.init();
    await memory.writeStatus("running");
    await memory.writePlan(["step one"]);
    await memory.appendFinding("found something");

    const snapshot = await getTaskSnapshot(taskId);
    expect(snapshot.status).toBe("running");
    expect(snapshot.plan).toContain("step one");
    expect(snapshot.findings).toContain("found something");
  });

  it("surfaces a persisted failure message", async () => {
    const taskId = randomUUID();
    createdTaskIds.push(taskId);
    const memory = new MemoryFileManager(taskId);
    await memory.init();
    await memory.writeStatus("failed", "boom");

    const snapshot = await getTaskSnapshot(taskId);
    expect(snapshot.status).toBe("failed");
    expect(snapshot.error).toBe("boom");
  });
});

describe("TERMINAL_STATUSES", () => {
  it("contains exactly the statuses after which nothing more is written", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(["cancelled", "completed", "failed"]);
  });
});
