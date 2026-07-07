import { describe, it, expect, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { resolveTaskPath, readFile, writeFile } from "./fileIO";

const taskRootFor = (taskId: string) =>
  path.join("/tmp", "tasks_data", taskId);

describe("resolveTaskPath", () => {
  const taskId = "task-123";
  const root = taskRootFor(taskId);

  it("resolves a plain relative path inside the workspace", () => {
    expect(resolveTaskPath(taskId, "notes.md")).toBe(
      path.join(root, "notes.md")
    );
  });

  it("resolves a nested relative path inside the workspace", () => {
    expect(resolveTaskPath(taskId, "sub/dir/a.md")).toBe(
      path.join(root, "sub", "dir", "a.md")
    );
  });

  it("allows an explicit ./ prefix", () => {
    expect(resolveTaskPath(taskId, "./notes.md")).toBe(
      path.join(root, "notes.md")
    );
  });

  it("rejects parent-directory traversal", () => {
    expect(() => resolveTaskPath(taskId, "../escape.md")).toThrow(
      /within the task workspace/
    );
  });

  it("rejects nested traversal that escapes the root", () => {
    expect(() => resolveTaskPath(taskId, "sub/../../escape.md")).toThrow(
      /within the task workspace/
    );
  });

  it("rejects absolute paths", () => {
    expect(() => resolveTaskPath(taskId, "/etc/passwd")).toThrow(
      /within the task workspace/
    );
  });
});

describe("readFile / writeFile", () => {
  const createdTaskIds: string[] = [];

  afterEach(async () => {
    for (const id of createdTaskIds.splice(0)) {
      await fs.rm(taskRootFor(id), { recursive: true, force: true });
    }
  });

  it("writes a file and reads it back within the workspace", async () => {
    const taskId = randomUUID();
    createdTaskIds.push(taskId);

    const writeResult = await writeFile({
      taskId,
      filePath: "out/result.md",
      content: "hello world",
    });
    expect(writeResult).toMatch(/written successfully/);
    expect(await readFile({ taskId, filePath: "out/result.md" })).toBe(
      "hello world"
    );
  });

  it("returns an error string (does not throw) on traversal in writeFile", async () => {
    const result = await writeFile({
      taskId: randomUUID(),
      filePath: "../escape.md",
      content: "x",
    });
    expect(result).toMatch(/Error writing file/);
  });

  it("returns an error string (does not throw) on traversal in readFile", async () => {
    const result = await readFile({
      taskId: randomUUID(),
      filePath: "../../etc/passwd",
    });
    expect(result).toMatch(/Error reading file/);
  });

  it("rejects malformed arguments via the schema", async () => {
    expect(await readFile({ taskId: "" })).toMatch(/expects/);
    expect(await writeFile({ taskId: "a", filePath: "b" })).toMatch(/expects/);
  });
});
