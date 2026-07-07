import { describe, it, expect } from "vitest";
import { isValidTaskId } from "../lib/taskId";

describe("isValidTaskId", () => {
  it("accepts a real UUID", () => {
    expect(isValidTaskId("3f8b2c1a-9d4e-4f7a-b2c1-0a1b2c3d4e5f")).toBe(true);
  });

  it("rejects path-traversal attempts and junk", () => {
    expect(isValidTaskId("../../etc/passwd")).toBe(false);
    expect(isValidTaskId("not-a-uuid")).toBe(false);
    expect(isValidTaskId("")).toBe(false);
    expect(isValidTaskId(null)).toBe(false);
    expect(isValidTaskId(undefined)).toBe(false);
    expect(isValidTaskId(42)).toBe(false);
  });
});
