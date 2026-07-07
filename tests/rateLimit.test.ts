import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clientKeyFromHeaders, _resetRateLimitsForTests } from "../lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitsForTests();
  });

  it("allows up to `max` requests within the window", () => {
    const key = "1.2.3.4";
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit(key, 1000, 3, 60_000);
      expect(result.allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 1000, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate buckets per key", () => {
    checkRateLimit("a", 0, 1, 60_000);
    const blockedA = checkRateLimit("a", 0, 1, 60_000);
    const allowedB = checkRateLimit("b", 0, 1, 60_000);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("allows again once the window has fully elapsed", () => {
    const key = "sliding";
    checkRateLimit(key, 0, 1, 1000);
    expect(checkRateLimit(key, 500, 1, 1000).allowed).toBe(false);
    expect(checkRateLimit(key, 1001, 1, 1000).allowed).toBe(true);
  });

  it("reports remaining capacity", () => {
    const result = checkRateLimit("remaining", 0, 5, 60_000);
    expect(result.remaining).toBe(4);
  });
});

describe("clientKeyFromHeaders", () => {
  it("prefers x-forwarded-for, taking the first hop", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientKeyFromHeaders(headers)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "3.3.3.3" });
    expect(clientKeyFromHeaders(headers)).toBe("3.3.3.3");
  });

  it("falls back to a constant when no proxy headers are present", () => {
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});
