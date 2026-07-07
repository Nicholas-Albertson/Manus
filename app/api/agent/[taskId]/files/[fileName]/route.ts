import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isValidTaskId } from "../../../../../../lib/taskId";

const allowedFiles = new Set([
  "task_plan.md",
  "findings.md",
  "progress.md",
  "summary.md",
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string; fileName: string }> }
) {
  const { taskId, fileName } = await params;
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }
  if (!allowedFiles.has(fileName)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join("/tmp", "tasks_data", taskId, fileName);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
