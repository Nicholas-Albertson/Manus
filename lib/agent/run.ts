// Thin wrappers around agentApp.invoke() shared by the direct (in-process)
// execution path and, when REDIS_URL is configured, the queue worker — both
// need identical start/resume/failure-handling semantics.
import { agentApp } from "./graph";
import { RECURSION_LIMIT } from "./limits";
import { MemoryFileManager } from "./memory";
import { taskStore } from "../store";
import type { AgentState } from "./state";
import { isQueueEnabled, enqueueRun, enqueueResume } from "../queue";

async function handleFailure(taskId: string, err: unknown) {
  console.error(`Agent error for task ${taskId}:`, err);
  taskStore.set(taskId, "failed");
  try {
    const memory = new MemoryFileManager(taskId);
    await memory.init();
    await memory.writeStatus("failed", err instanceof Error ? err.message : String(err));
  } catch (writeErr) {
    console.error("Failed to persist failure status:", writeErr);
  }
}

/**
 * Actually run a task to completion/pause/failure. Called directly for the
 * in-process path, or from worker.ts when processing a queued "run" job.
 * Failures are caught and persisted internally — never throws.
 */
export async function invokeRun(initialState: AgentState): Promise<void> {
  try {
    await agentApp.invoke(initialState, {
      configurable: { thread_id: initialState.taskId },
      recursionLimit: RECURSION_LIMIT,
    });
  } catch (err) {
    await handleFailure(initialState.taskId, err);
  }
}

/**
 * Actually resume a task paused at the plan-approval checkpoint. Must run in
 * the same process that holds the in-memory checkpoint for this taskId (see
 * the `checkpointer` caveat in graph.ts) — i.e. the same long-lived worker
 * process that originally paused it, when queueing is enabled.
 */
export async function invokeResume(taskId: string): Promise<void> {
  try {
    await agentApp.invoke(null, {
      configurable: { thread_id: taskId },
      recursionLimit: RECURSION_LIMIT,
    });
  } catch (err) {
    await handleFailure(taskId, err);
  }
}

/**
 * Start a brand-new task run. When REDIS_URL is configured this enqueues the
 * job and returns immediately, letting the worker process pick it up (surviving
 * an API server restart); otherwise it runs in-process, fire-and-forget.
 */
export async function runTask(initialState: AgentState): Promise<void> {
  if (isQueueEnabled()) {
    await enqueueRun(initialState);
    return;
  }
  await invokeRun(initialState);
}

/** Resume a task paused at the plan-approval checkpoint (queued or direct, mirroring runTask). */
export async function resumeTask(taskId: string): Promise<void> {
  if (isQueueEnabled()) {
    await enqueueResume(taskId);
    return;
  }
  await invokeResume(taskId);
}
