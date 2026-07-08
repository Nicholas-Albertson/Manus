import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import os from "os";
import type { SystemMessage } from "@langchain/core/messages";

// Isolate this file's checkpoint DB from the default /tmp/tasks_data/checkpoints.db
// so tests don't accumulate rows in (or race with) the real one.
const checkpointDbPath = path.join(os.tmpdir(), `graph-test-checkpoints-${randomUUID()}.db`);
process.env.CHECKPOINT_DB_PATH = checkpointDbPath;

afterAll(async () => {
  await fs.rm(checkpointDbPath, { force: true });
  await fs.rm(`${checkpointDbPath}-journal`, { force: true });
});

// Fake LLM keyed off the system prompt so each graph node gets a scripted,
// deterministic response without any network access.
function systemText(messages: unknown[]): string {
  const sys = (messages as SystemMessage[]).find((m) => "content" in m);
  return String(sys?.content ?? "");
}

const executionPrompts: string[] = [];

function fakeInvoke(messages: unknown[]) {
  const text = systemText(messages);
  const usage_metadata = { input_tokens: 10, output_tokens: 5, total_tokens: 15 };
  if (text.includes("planning agent")) {
    return Promise.resolve({ content: "- Do step one\n- Do step two", tool_calls: [], usage_metadata });
  }
  if (text.includes("execution agent")) {
    executionPrompts.push(text);
    return Promise.resolve({ content: "Step done", tool_calls: [], usage_metadata });
  }
  if (text.includes("verification agent")) {
    return Promise.resolve({ content: "SUCCESS: looks good", tool_calls: [], usage_metadata });
  }
  if (text.includes("synthesis agent")) {
    return Promise.resolve({ content: "# Final answer\n\nAll done.", tool_calls: [], usage_metadata });
  }
  throw new Error(`Unexpected system prompt: ${text}`);
}

vi.mock("../lib/agent/llm", () => ({
  getLlm: () => ({
    invoke: fakeInvoke,
    bindTools: () => ({ invoke: fakeInvoke }),
  }),
  activeModelName: () => "gpt-4o",
}));

const savedEnv = { ...process.env };
const taskDirs: string[] = [];

afterEach(async () => {
  process.env = { ...savedEnv };
  vi.resetModules();
  executionPrompts.length = 0;
  await Promise.all(taskDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function newTaskId() {
  const id = randomUUID();
  taskDirs.push(path.join("/tmp", "tasks_data", id));
  return id;
}

describe("agentApp (plan approval off, default)", () => {
  it("runs planning -> execution -> verification -> summary to completion", async () => {
    delete process.env.REQUIRE_PLAN_APPROVAL;
    const { agentApp } = await import("../lib/agent/graph");
    const { RECURSION_LIMIT } = await import("../lib/agent/limits");
    const taskId = newTaskId();

    const result = await agentApp.invoke(
      {
        taskId,
        userInput: "Do a thing",
        plan: [],
        currentStepIndex: 0,
        stepAttempts: 0,
        findings: [],
        toolCalls: [],
        messages: [],
        finalOutput: undefined,
        error: undefined,
      },
      { configurable: { thread_id: taskId }, recursionLimit: RECURSION_LIMIT }
    );

    expect(result.plan).toEqual(["Do step one", "Do step two"]);
    expect(result.finalOutput).toContain("Final answer");

    const { MemoryFileManager } = await import("../lib/agent/memory");
    const status = await new MemoryFileManager(taskId).readStatus();
    expect(status?.status).toBe("completed");

    // Step 1 has no prior findings; step 2 should see step 1's finding
    // ("Step done") fed back into its prompt.
    expect(executionPrompts).toHaveLength(2);
    expect(executionPrompts[0]).not.toContain("Findings from earlier steps");
    expect(executionPrompts[1]).toContain("Findings from earlier steps so far");
    expect(executionPrompts[1]).toContain("1. Step done");
  });
});

describe("agentApp (plan approval on)", () => {
  it("pauses after planning and resumes to completion on approve", async () => {
    process.env.REQUIRE_PLAN_APPROVAL = "true";
    const { agentApp } = await import("../lib/agent/graph");
    const { RECURSION_LIMIT } = await import("../lib/agent/limits");
    const { MemoryFileManager } = await import("../lib/agent/memory");
    const taskId = newTaskId();

    const paused = await agentApp.invoke(
      {
        taskId,
        userInput: "Do a thing",
        plan: [],
        currentStepIndex: 0,
        stepAttempts: 0,
        findings: [],
        toolCalls: [],
        messages: [],
        finalOutput: undefined,
        error: undefined,
      },
      { configurable: { thread_id: taskId }, recursionLimit: RECURSION_LIMIT }
    );

    // Paused before execution: plan exists, but nothing has run yet.
    expect(paused.plan).toEqual(["Do step one", "Do step two"]);
    expect(paused.finalOutput).toBeUndefined();
    expect(paused.findings).toEqual([]);

    const memory = new MemoryFileManager(taskId);
    const pausedStatus = await memory.readStatus();
    expect(pausedStatus?.status).toBe("awaiting_approval");

    // Resume: input is null, graph continues from the checkpoint.
    const resumed = await agentApp.invoke(null, {
      configurable: { thread_id: taskId },
      recursionLimit: RECURSION_LIMIT,
    });

    expect(resumed.finalOutput).toContain("Final answer");
    const finalStatus = await memory.readStatus();
    expect(finalStatus?.status).toBe("completed");
  });

  it("resumes from a freshly-imported agentApp instance (simulates a process restart)", async () => {
    process.env.REQUIRE_PLAN_APPROVAL = "true";
    const { agentApp: firstProcess } = await import("../lib/agent/graph");
    const { RECURSION_LIMIT } = await import("../lib/agent/limits");
    const { MemoryFileManager } = await import("../lib/agent/memory");
    const taskId = newTaskId();

    const paused = await firstProcess.invoke(
      {
        taskId,
        userInput: "Do a thing",
        plan: [],
        currentStepIndex: 0,
        stepAttempts: 0,
        findings: [],
        toolCalls: [],
        messages: [],
        finalOutput: undefined,
        error: undefined,
      },
      { configurable: { thread_id: taskId }, recursionLimit: RECURSION_LIMIT }
    );
    expect(paused.finalOutput).toBeUndefined();

    // Drop every cached module — including graph.ts's module-level
    // `checkpointer` singleton — and re-import from scratch. This is the
    // closest a same-process test can get to "a different process, sharing
    // only the SQLite file on disk, resumes the paused task."
    vi.resetModules();
    const { agentApp: secondProcess } = await import("../lib/agent/graph");
    expect(secondProcess).not.toBe(firstProcess);

    const resumed = await secondProcess.invoke(null, {
      configurable: { thread_id: taskId },
      recursionLimit: RECURSION_LIMIT,
    });

    expect(resumed.finalOutput).toContain("Final answer");
    const finalStatus = await new MemoryFileManager(taskId).readStatus();
    expect(finalStatus?.status).toBe("completed");
  });
});
