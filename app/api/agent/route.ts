import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { agentApp, RECURSION_LIMIT } from "../../../lib/agent/graph";
import { AgentState } from "../../../lib/agent/state";
import { MemoryFileManager } from "../../../lib/agent/memory";
import { taskStore } from "../../../lib/store";
import { isValidTaskId } from "../../../lib/taskId";
import { env } from "../../../lib/env";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    if (!env.openAiApiKey()) {
      return NextResponse.json(
        {
          error:
            "Missing OPENAI_API_KEY. Set it in your environment (e.g. .env.local) before starting a task.",
        },
        { status: 500 }
      );
    }

    const { userInput } = await req.json();
    if (typeof userInput !== "string" || !userInput.trim()) {
      return NextResponse.json({ error: "Missing userInput" }, { status: 400 });
    }
    if (userInput.length > 4000) {
      return NextResponse.json(
        { error: "userInput is too long (max 4000 characters)" },
        { status: 400 }
      );
    }

    const taskId = randomUUID();
    taskStore.set(taskId, "pending");

    // Persist an initial status so the task is observable before the graph runs.
    const memory = new MemoryFileManager(taskId);
    await memory.init();
    await memory.writeStatus("pending");

    const initialState: AgentState = {
      taskId,
      userInput,
      plan: [],
      currentStepIndex: 0,
      stepAttempts: 0,
      findings: [],
      toolCalls: [],
      messages: [],
      finalOutput: undefined,
      error: undefined,
    };

    agentApp
      .invoke(initialState, { recursionLimit: RECURSION_LIMIT })
      .catch(async (err) => {
        console.error(`Agent error for task ${taskId}:`, err);
        taskStore.set(taskId, "failed");
        try {
          await memory.init();
          await memory.writeStatus(
            "failed",
            err instanceof Error ? err.message : String(err)
          );
        } catch (writeErr) {
          console.error("Failed to persist failure status:", writeErr);
        }
      });

    return NextResponse.json({ taskId, status: "started" });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const durable = await new MemoryFileManager(taskId).readStatus();
  const status = durable?.status || taskStore.get(taskId) || "pending";
  return NextResponse.json({ taskId, status, error: durable?.error ?? null });
}
