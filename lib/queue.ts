// Optional durable job queue: when REDIS_URL is set, task runs and resumes
// are enqueued to BullMQ/Redis and processed by the standalone worker (see
// worker.ts) instead of running fire-and-forget inside the Next.js server
// process. This is what makes a task survive an API server restart and
// scales execution across multiple worker instances — the gap called out as
// the last open durability item in IMPROVEMENTS.md (#6).
//
// When REDIS_URL is unset, none of this is touched: run.ts falls back to the
// original direct in-process invoke, so the zero-config local/dev experience
// is unchanged.
import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "./env";
import type { AgentState } from "./agent/state";

export const QUEUE_NAME = "taskflow-runs";

export type QueueJobData =
  | { type: "run"; initialState: AgentState }
  | { type: "resume"; taskId: string };

export function isQueueEnabled(): boolean {
  return Boolean(env.redisUrl());
}

// BullMQ requires this on the connection it drives (blocking commands would
// otherwise be retried forever by ioredis's own reconnect logic).
export function getQueueConnection(): ConnectionOptions {
  const url = env.redisUrl();
  if (!url) {
    throw new Error("getQueueConnection() called without REDIS_URL set");
  }
  return { url, maxRetriesPerRequest: null };
}

let queue: Queue<QueueJobData> | null = null;

export function getQueue(): Queue<QueueJobData> {
  if (!queue) {
    queue = new Queue<QueueJobData>(QUEUE_NAME, { connection: getQueueConnection() });
  }
  return queue;
}

export async function enqueueRun(initialState: AgentState): Promise<void> {
  await getQueue().add("run", { type: "run", initialState });
}

export async function enqueueResume(taskId: string): Promise<void> {
  await getQueue().add("resume", { type: "resume", taskId });
}

/** Test-only: drop the cached queue so a fresh REDIS_URL takes effect. */
export async function _resetQueueForTests(): Promise<void> {
  await queue?.close();
  queue = null;
}
