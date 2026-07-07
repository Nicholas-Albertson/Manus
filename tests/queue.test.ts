import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Worker, type Job } from "bullmq";
import net from "net";

// Integration test against a real Redis — this repo's redis-server is
// available locally and CI provisions a `redis:7-alpine` service (see
// .github/workflows/ci.yml). If neither is reachable (e.g. a contributor
// running `npm test` without Redis installed), the suite skips itself
// rather than failing on unrelated missing infra.
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisAvailable = false;

/**
 * Plain TCP reachability check, deliberately independent of bullmq/ioredis's
 * own (infinitely-retrying-by-default) connection logic — that logic doesn't
 * time out on its own and would hang the beforeAll hook when Redis is down.
 */
function isTcpReachable(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const { hostname, port } = new URL(url);
    const socket = net.createConnection({ host: hostname, port: Number(port) || 6379 });
    const finish = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

beforeAll(async () => {
  process.env.REDIS_URL = REDIS_URL;
  redisAvailable = await isTcpReachable(REDIS_URL, 1500);
  if (!redisAvailable) {
    console.warn("[queue.test] Redis not reachable at", REDIS_URL, "— skipping queue integration tests.");
  }
});

afterEach(async () => {
  if (!redisAvailable) return;
  const { getQueue } = await import("../lib/queue");
  await getQueue().obliterate({ force: true });
});

afterAll(async () => {
  if (!redisAvailable) return;
  const { _resetQueueForTests } = await import("../lib/queue");
  await _resetQueueForTests();
});

describe("queue", () => {
  it("isQueueEnabled() reflects REDIS_URL", async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const { isQueueEnabled } = await import("../lib/queue");
    expect(isQueueEnabled()).toBe(false);
    process.env.REDIS_URL = saved;
    expect(isQueueEnabled()).toBe(true);
  });

  it("enqueueRun() delivers a job a worker can process", async () => {
    if (!redisAvailable) return;
    const { enqueueRun, getQueueConnection, QUEUE_NAME } = await import("../lib/queue");

    const processed: unknown[] = [];
    const worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        processed.push(job.data);
      },
      { connection: getQueueConnection() }
    );

    try {
      const initialState = {
        taskId: "11111111-1111-4111-8111-111111111111",
        userInput: "test",
        plan: [],
        currentStepIndex: 0,
        stepAttempts: 0,
        findings: [],
        toolCalls: [],
        messages: [],
        finalOutput: undefined,
        error: undefined,
      };
      await enqueueRun(initialState);

      await vi_waitFor(() => processed.length > 0, 5000);
      expect(processed).toEqual([{ type: "run", initialState }]);
    } finally {
      await worker.close();
    }
  });

  it("enqueueResume() delivers a resume job", async () => {
    if (!redisAvailable) return;
    const { enqueueResume, getQueueConnection, QUEUE_NAME } = await import("../lib/queue");

    const processed: unknown[] = [];
    const worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        processed.push(job.data);
      },
      { connection: getQueueConnection() }
    );

    try {
      await enqueueResume("22222222-2222-4222-8222-222222222222");
      await vi_waitFor(() => processed.length > 0, 5000);
      expect(processed).toEqual([{ type: "resume", taskId: "22222222-2222-4222-8222-222222222222" }]);
    } finally {
      await worker.close();
    }
  });
});

async function vi_waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
