import { describe, it, expect } from "vitest";
import { asText } from "../lib/agent/text";

describe("asText", () => {
  it("passes strings through", () => {
    expect(asText("hello")).toBe("hello");
  });

  it("joins structured content parts", () => {
    expect(
      asText([{ type: "text", text: "a" }, "b", { type: "text", text: "c" }])
    ).toBe("abc");
  });

  it("handles null/undefined and other values", () => {
    expect(asText(null)).toBe("");
    expect(asText(undefined)).toBe("");
    expect(asText(123)).toBe("123");
  });
});
