import { NextRequest, NextResponse } from "next/server";
import { MemoryFileManager } from "../../../../../lib/agent/memory";
import { resumeTask } from "../../../../../lib/agent/run";
import { taskStore } from "../../../../../lib/store";
import { isValidTaskId } from "../../../../../lib/taskId";

// Resumes a task paused at the plan-approval checkpoint (see graph.ts).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const memory = new MemoryFileManager(taskId);
  const status = await memory.readStatus();
  if (!status || status.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: "Task is not awaiting approval." },
      { status: 409 }
    );
  }

  taskStore.set(taskId, "running");
  await memory.writeStatus("running");
  await memory.logProgress("Plan approved", "Resuming execution");

  resumeTask(taskId);

  return NextResponse.json({ taskId, status: "running" });
}
