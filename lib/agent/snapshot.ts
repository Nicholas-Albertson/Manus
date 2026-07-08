// Shared "read everything about a task" logic, used by both the plain poll
// endpoint (GET /api/agent/[taskId]) and the SSE stream endpoint
// (GET /api/agent/[taskId]/stream) so they can never drift out of sync.
import { MemoryFileManager } from "./memory";
import { taskStore } from "../store";
import type { UsageTotals } from "./cost";

export interface TaskSnapshot {
  taskId: string;
  status: string;
  error: string | null;
  plan: string;
  findings: string;
  progress: string;
  summary: string;
  usage: UsageTotals;
}

export async function getTaskSnapshot(taskId: string): Promise<TaskSnapshot> {
  const memory = new MemoryFileManager(taskId);
  const [files, durable, usage] = await Promise.all([
    memory.getAllFiles(),
    memory.readStatus(),
    memory.readUsage(),
  ]);
  const status = durable?.status || taskStore.get(taskId) || "pending";

  return {
    taskId,
    status,
    error: durable?.error ?? null,
    plan: files["task_plan.md"] || "",
    findings: files["findings.md"] || "",
    progress: files["progress.md"] || "",
    summary: files["summary.md"] || "",
    usage,
  };
}

/** Statuses after which nothing further will ever be written for a task. */
export const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
