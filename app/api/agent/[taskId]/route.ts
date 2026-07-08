import { NextRequest, NextResponse } from "next/server";
import { isValidTaskId } from "../../../../lib/taskId";
import { getTaskSnapshot } from "../../../../lib/agent/snapshot";

// Single endpoint returning status + all task documents. Prefer the SSE
// stream at GET /api/agent/[taskId]/stream for live updates; this remains
// for one-shot fetches (e.g. non-EventSource clients, initial load).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const snapshot = await getTaskSnapshot(taskId);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
