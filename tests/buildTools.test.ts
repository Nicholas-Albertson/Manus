import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { buildTools, TOOL_NAMES } from "../lib/agent/tools";

describe("buildTools", () => {
  it("exposes exactly the expected tools", () => {
    const tools = buildTools(randomUUID());
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("injects taskId so file tools stay workspace-scoped (write → read)", async () => {
    const tools = buildTools(randomUUID());
    const write = tools.find((t) => t.name === "write_file")!;
    const read = tools.find((t) => t.name === "read_file")!;

    const w = String(await write.invoke({ filePath: "note.txt", content: "scoped!" }));
    expect(w).toMatch(/written successfully/);

    const r = String(await read.invoke({ filePath: "note.txt" }));
    expect(r).toBe("scoped!");
  });

  it("keeps two tasks isolated from each other", async () => {
    const a = buildTools(randomUUID());
    const b = buildTools(randomUUID());
    await a.find((t) => t.name === "write_file")!.invoke({
      filePath: "secret.txt",
      content: "task A only",
    });
    const readFromB = String(
      await b.find((t) => t.name === "read_file")!.invoke({ filePath: "secret.txt" })
    );
    expect(readFromB).toMatch(/Error reading file/);
  });
});
