import { describe, it, expect, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { MemoryFileManager } from "./memory";

const planLines = async (taskId: string): Promise<string[]> => {
  const raw = await fs.readFile(
    path.join("/tmp", "tasks_data", taskId, "task_plan.md"),
    "utf-8"
  );
  return raw.split("\n").filter((l) => l.startsWith("- ["));
};

describe("MemoryFileManager.checkOffStep", () => {
  const createdTaskIds: string[] = [];

  const newManager = async () => {
    const taskId = randomUUID();
    createdTaskIds.push(taskId);
    const m = new MemoryFileManager(taskId);
    await m.init();
    return { taskId, m };
  };

  afterEach(async () => {
    for (const id of createdTaskIds.splice(0)) {
      await fs.rm(path.join("/tmp", "tasks_data", id), {
        recursive: true,
        force: true,
      });
    }
  });

  it("checks off the requested step", async () => {
    const { taskId, m } = await newManager();
    await m.writePlan(["alpha", "beta", "gamma"]);

    await m.checkOffStep(1);

    expect(await planLines(taskId)).toEqual([
      "- [ ] alpha",
      "- [x] beta",
      "- [ ] gamma",
    ]);
  });

  // Regression: previously checkOffStep counted only unchecked ("- [ ]") lines,
  // so once an earlier step was checked the index→line mapping drifted and the
  // wrong (or no) line got checked. After checking step 0 then step 1, step 1
  // must end up checked — not step 2.
  it("checks off sequential steps without drifting the index mapping", async () => {
    const { taskId, m } = await newManager();
    await m.writePlan(["alpha", "beta", "gamma"]);

    await m.checkOffStep(0);
    await m.checkOffStep(1);

    expect(await planLines(taskId)).toEqual([
      "- [x] alpha",
      "- [x] beta",
      "- [ ] gamma",
    ]);
  });

  it("can check off every step in order", async () => {
    const { taskId, m } = await newManager();
    await m.writePlan(["alpha", "beta", "gamma"]);

    await m.checkOffStep(0);
    await m.checkOffStep(1);
    await m.checkOffStep(2);

    expect(await planLines(taskId)).toEqual([
      "- [x] alpha",
      "- [x] beta",
      "- [x] gamma",
    ]);
  });

  it("is a no-op for an out-of-range index", async () => {
    const { taskId, m } = await newManager();
    await m.writePlan(["alpha", "beta"]);

    await m.checkOffStep(5);

    expect(await planLines(taskId)).toEqual(["- [ ] alpha", "- [ ] beta"]);
  });
});
