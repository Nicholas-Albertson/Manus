import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { agentApp } from "../../../lib/agent/graph";
import { AgentState } from "../../../lib/agent/state";
import { taskStore } from "../../../lib/store";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Missing OPENAI_API_KEY. Set it in your environment (e.g. .env.local) before starting a task.",
        },
        { status: 500 }
      );
    }

    const { userInput } = await req.json();
    if (!userInput) {
      return NextResponse.json({ error: "Missing userInput" }, { status: 400 });
    }

    const taskId = uuidv4();
    taskStore.set(taskId, "pending");

    const initialState: AgentState = {
      taskId,
      userInput,
      plan: [],
      currentStepIndex: 0,
      findings: [],
      toolCalls: [],
      messages: [],
    };

    agentApp.invoke(initialState).catch((err) => {
      console.error(`Agent error for task ${taskId}:`, err);
      taskStore.set(taskId, "failed");
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
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const status = taskStore.get(taskId) || "pending";
  return NextResponse.json({ taskId, status });
}
