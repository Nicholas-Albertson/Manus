// In-memory sliding-window rate limiter, keyed by client identifier (IP).
// Single-instance only — consistent with the rest of this app's in-memory
// state (see store.ts); a multi-instance deployment needs a shared store
// (e.g. Redis) instead. Bounds abusive/looping clients from spamming task
// creation, which is the actual cost driver (each task runs many LLM calls).
import { env } from "./env";

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so long-lived processes don't accumulate stale entries for
// clients that stopped sending requests.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the caller should retry, only set when blocked. */
  retryAfterMs?: number;
  limit: number;
  remaining: number;
}

/**
 * Check and record a request for `key` against a fixed-size sliding window.
 * `now` is injectable for deterministic tests.
 */
export function checkRateLimit(
  key: string,
  now: number = Date.now(),
  max: number = env.rateLimitMax(),
  windowMs: number = env.rateLimitWindowMs()
): RateLimitResult {
  sweep(now, windowMs);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    return {
      allowed: false,
      retryAfterMs: Math.max(0, windowMs - (now - oldest)),
      limit: max,
      remaining: 0,
    };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    limit: max,
    remaining: max - bucket.timestamps.length,
  };
}

/** Test-only: clear all buckets between test cases. */
export function _resetRateLimitsForTests() {
  buckets.clear();
  lastSweep = Date.now();
}

/** Best-effort client identifier from proxy headers, falling back to a constant. */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
