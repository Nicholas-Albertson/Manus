import { NextRequest, NextResponse } from "next/server";
import { MemoryFileManager } from "../../../../lib/agent/memory";
import { taskStore } from "../../../../lib/store";

// task IDs are server-generated UUIDs; reject anything else to prevent path traversal.
const taskIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Single endpoint returning status + all task documents, so the client can poll
// once per tick instead of issuing five separate requests.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  if (!taskId || !taskIdPattern.test(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const memory = new MemoryFileManager(taskId);
  const files = await memory.getAllFiles();
  const status = taskStore.get(taskId) || "pending";

  return NextResponse.json(
    {
      taskId,
      status,
      plan: files["task_plan.md"] || "",
      findings: files["findings.md"] || "",
      progress: files["progress.md"] || "",
      summary: files["summary.md"] || "",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
