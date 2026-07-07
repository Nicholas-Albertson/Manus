import { NextRequest, NextResponse } from "next/server";
import { MemoryFileManager } from "../../../../../lib/agent/memory";
import { taskStore } from "../../../../../lib/store";
import { isValidTaskId } from "../../../../../lib/taskId";

// Cancels a task paused at the plan-approval checkpoint (see graph.ts). The
// underlying LangGraph checkpoint is simply left unresumed.
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

  taskStore.set(taskId, "cancelled");
  await memory.writeStatus("cancelled");
  await memory.logProgress("Plan rejected", "Task cancelled before execution");

  return NextResponse.json({ taskId, status: "cancelled" });
}
