import { NextRequest } from "next/server";
import { isValidTaskId } from "../../../../../lib/taskId";
import { getTaskSnapshot, TERMINAL_STATUSES } from "../../../../../lib/agent/snapshot";

// Live task updates over Server-Sent Events. The execution engine (direct
// in-process invoke, or the durable-queue worker in a separate process) only
// ever communicates through the on-disk task files (see MemoryFileManager) —
// this endpoint just polls those files far more frequently than the client
// used to (500ms vs. the old 2s client-side poll) and only pushes a message
// when something actually changed, so it works identically regardless of
// which process is running the task.
export const dynamic = "force-dynamic";
// Generous ceiling for platforms that enforce a route max duration; a task
// is bounded by RECURSION_LIMIT and should finish well under this in
// practice. Self-hosted (this app's target deployment) doesn't need it.
export const maxDuration = 300;

const POLL_INTERVAL_MS = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  if (!isValidTaskId(taskId)) {
    return new Response("Invalid taskId", { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let lastPayload = "";

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting
        }
      };

      const tick = async () => {
        if (closed) return;
        let snapshot;
        try {
          snapshot = await getTaskSnapshot(taskId);
        } catch (err) {
          console.error(`SSE stream error for task ${taskId}:`, err);
          close();
          return;
        }
        if (closed) return; // client may have disconnected mid-read

        const payload = JSON.stringify(snapshot);
        if (payload !== lastPayload) {
          lastPayload = payload;
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }
        if (TERMINAL_STATUSES.has(snapshot.status)) {
          close();
        }
      };

      req.signal.addEventListener("abort", close);

      await tick(); // push current state immediately on connect
      if (!closed) {
        timer = setInterval(tick, POLL_INTERVAL_MS);
      }
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
