// Standalone worker process for the optional Redis-backed durable queue.
// Run with `npm run worker` (requires REDIS_URL). The Next.js API routes
// enqueue "run"/"resume" jobs here instead of invoking the agent graph
// in-process whenever REDIS_URL is set — see lib/agent/run.ts and
// lib/queue.ts for the enable/disable logic and rationale.
import { Worker, type Job } from "bullmq";
import { env } from "./lib/env";
import { QUEUE_NAME, isQueueEnabled, getQueueConnection, type QueueJobData } from "./lib/queue";
import { invokeRun, invokeResume } from "./lib/agent/run";

if (!isQueueEnabled()) {
  console.error(
    "[worker] REDIS_URL is not set — nothing to connect to. " +
      "Set REDIS_URL (e.g. redis://redis:6379) to run the durable worker."
  );
  process.exit(1);
}

async function processJob(job: Job<QueueJobData>): Promise<void> {
  if (job.data.type === "run") {
    await invokeRun(job.data.initialState);
  } else {
    await invokeResume(job.data.taskId);
  }
}

const worker = new Worker<QueueJobData>(QUEUE_NAME, processJob, {
  connection: getQueueConnection(),
  concurrency: 4,
});

function taskIdOf(job: Job<QueueJobData>): string {
  return job.data.type === "run" ? job.data.initialState.taskId : job.data.taskId;
}

worker.on("completed", (job) => {
  console.log(`[worker] ${job.data.type} job ${job.id} (task ${taskIdOf(job)}) completed`);
});
worker.on("failed", (job, err) => {
  console.error(`[worker] ${job?.data.type} job ${job?.id} (task ${job && taskIdOf(job)}) failed:`, err);
});

console.log(`[worker] listening on queue "${QUEUE_NAME}" at ${env.redisUrl()}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`[worker] received ${signal}, shutting down…`);
    await worker.close();
    process.exit(0);
  });
}
