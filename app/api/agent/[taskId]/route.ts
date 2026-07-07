import { NextRequest, NextResponse } from "next/server";
import { MemoryFileManager } from "../../../../lib/agent/memory";
import { taskStore } from "../../../../lib/store";
import { isValidTaskId } from "../../../../lib/taskId";

// Single endpoint returning status + all task documents, so the client can poll
// once per tick instead of issuing five separate requests.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const memory = new MemoryFileManager(taskId);
  const [files, durable, usage] = await Promise.all([
    memory.getAllFiles(),
    memory.readStatus(),
    memory.readUsage(),
  ]);
  const status = durable?.status || taskStore.get(taskId) || "pending";

  return NextResponse.json(
    {
      taskId,
      status,
      error: durable?.error ?? null,
      plan: files["task_plan.md"] || "",
      findings: files["findings.md"] || "",
      progress: files["progress.md"] || "",
      summary: files["summary.md"] || "",
      usage,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
