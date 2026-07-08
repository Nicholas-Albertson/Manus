import { describe, it, expect, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { GET } from "./route";

// The route handler ignores its request arg; a stub is enough.
const req = {} as never;
const call = (taskId: string, fileName: string) =>
  GET(req, { params: Promise.resolve({ taskId, fileName }) });

const validUuid = () => randomUUID();

describe("GET /api/agent/[taskId]/files/[fileName]", () => {
  const createdTaskIds: string[] = [];

  afterEach(async () => {
    for (const id of createdTaskIds.splice(0)) {
      await fs.rm(path.join("/tmp", "tasks_data", id), {
        recursive: true,
        force: true,
      });
    }
  });

  it("rejects a non-UUID taskId (path traversal guard)", async () => {
    const res = await call("../../etc", "summary.md");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid taskId" });
  });

  it("rejects a taskId that is almost-but-not a UUID", async () => {
    const res = await call("12345678-1234-1234-1234-12345678", "summary.md");
    expect(res.status).toBe(400);
  });

  it("rejects a filename outside the allowlist", async () => {
    const res = await call(validUuid(), "secrets.env");
    expect(res.status).toBe(404);
  });

  it("rejects a traversal filename even with a valid taskId", async () => {
    const res = await call(validUuid(), "../../../etc/passwd");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an allowlisted file that does not exist", async () => {
    const res = await call(validUuid(), "summary.md");
    expect(res.status).toBe(404);
  });

  it("returns the content of an existing allowlisted file", async () => {
    const taskId = validUuid();
    createdTaskIds.push(taskId);
    const dir = path.join("/tmp", "tasks_data", taskId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "summary.md"), "# done\n");

    const res = await call(taskId, "summary.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("# done\n");
  });
});
