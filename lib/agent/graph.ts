import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentAnnotation, type AgentState } from "./state";
import { MemoryFileManager } from "./memory";
import { buildTools, TOOL_NAMES } from "./tools";
import { taskStore } from "../store";
import { asText } from "./text";
import type { ToolCall } from "./state";
import { getLlm, activeModelName } from "./llm";
import { MAX_PLAN_STEPS, MAX_STEP_ATTEMPTS, RECURSION_LIMIT } from "./limits";
import { env } from "../env";

export { MAX_PLAN_STEPS, MAX_STEP_ATTEMPTS, RECURSION_LIMIT };

/**
 * Checkpoints graph state so an interrupted run (plan-approval pause) can be
 * resumed later with `agentApp.invoke(null, { configurable: { thread_id } })`.
 * In-memory only — single-instance, same caveat as taskStore/rate limiting:
 * a paused task can't be resumed after a process restart, and (with the
 * optional Redis worker) must be resumed by the same worker process that
 * paused it. A persistent checkpointer (e.g. Postgres/SQLite) would remove
 * that constraint if multi-instance human-in-the-loop is needed.
 */
export const checkpointer = new MemorySaver();

/** Record token usage from an LLM response, if the provider reported any. */
async function trackUsage(memory: MemoryFileManager, response: { usage_metadata?: unknown }) {
  const usage = response.usage_metadata as
    | { input_tokens: number; output_tokens: number; total_tokens: number }
    | undefined;
  if (!usage) return;
  await memory.recordUsage(activeModelName(), usage);
}

async function planningNode(state: AgentState): Promise<Partial<AgentState>> {
  const memory = new MemoryFileManager(state.taskId);
  await memory.init();
  taskStore.set(state.taskId, "running");
  await memory.writeStatus("running");

  const llm = getLlm();
  const system = new SystemMessage(
    "You are an AI planning agent. Given a user's request, break it down into a numbered list of actionable steps. " +
    `Each step should be clear and executable by an agent with tools: ${[...TOOL_NAMES].join(", ")}. ` +
    `Use at most ${MAX_PLAN_STEPS} steps; prefer fewer, well-scoped steps over many ambiguous ones. ` +
    "Return ONLY the list, one step per line, starting with a dash and space."
  );
  const response = await llm.invoke([system, new HumanMessage(state.userInput)]);
  await trackUsage(memory, response);
  const content = asText(response.content);
  const lines = content
    .split("\n")
    .filter(line => line.trim().startsWith("-"))
    .map(line => line.replace(/^-\s*/, "").trim())
    .filter(line => line.length > 0)
    .slice(0, MAX_PLAN_STEPS);

  await memory.writePlan(lines);
  await memory.logProgress("Planning completed", `${lines.length} steps generated`);

  // When plan approval is required, the graph interrupts right before the
  // "planApproval" node — reflect that in status now, before the pause.
  const needsApproval = env.requirePlanApproval() && lines.length > 0;
  if (needsApproval) {
    taskStore.set(state.taskId, "awaiting_approval");
    await memory.writeStatus("awaiting_approval");
    await memory.logProgress(
      "Awaiting approval",
      "Plan generated — waiting for approve/reject before execution begins"
    );
  }

  return {
    plan: lines,
    currentStepIndex: 0,
    stepAttempts: 0,
    messages: [response],
  };
}

/** No-op node whose only purpose is an `interruptBefore` target for plan approval. */
async function planApprovalNode(): Promise<Partial<AgentState>> {
  return {};
}

async function executionNode(state: AgentState): Promise<Partial<AgentState>> {
  const memory = new MemoryFileManager(state.taskId);
  const step = state.plan[state.currentStepIndex];
  const attemptLabel =
    state.stepAttempts > 0 ? ` (retry ${state.stepAttempts})` : "";
  await memory.logProgress(
    `Executing step ${state.currentStepIndex + 1}${attemptLabel}`,
    step
  );

  // Native tool-calling: bind structured tools so the model emits validated
  // tool_calls instead of free-form JSON we have to parse and hope is correct.
  const taskTools = buildTools(state.taskId);
  const toolByName = new Map(taskTools.map((t) => [t.name, t]));
  const llm = getLlm().bindTools(taskTools);

  const system = new SystemMessage(
    "You are an execution agent. Complete the current step. " +
      "Call a tool when it helps; otherwise reply with the result as plain text. " +
      `Current step: ${step}`
  );
  const response = await llm.invoke([system, new HumanMessage(step)]);
  await trackUsage(memory, response);

  const calls = response.tool_calls ?? [];
  const recordedCalls: ToolCall[] = [];
  const results: string[] = [];

  for (const call of calls) {
    const selected = toolByName.get(call.name);
    let result: string;
    if (selected) {
      try {
        result = String(await selected.invoke(call.args));
      } catch (err) {
        result = `Error running ${call.name}: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    } else {
      result = `Unknown tool requested: ${call.name}`;
    }
    recordedCalls.push({
      toolName: call.name,
      arguments: call.args,
      result,
      timestamp: new Date(),
    });
    results.push(result);
    await memory.appendFinding(`Tool ${call.name} result: ${result}`);
  }

  let resultText: string;
  if (calls.length > 0) {
    resultText = results.join("\n");
  } else {
    // No tool call — the model answered directly.
    resultText = asText(response.content);
    recordedCalls.push({
      toolName: "llm_response",
      arguments: { response: resultText },
      result: resultText,
      timestamp: new Date(),
    });
    await memory.appendFinding(`Step ${state.currentStepIndex + 1}: ${resultText}`);
  }

  return {
    findings: [...state.findings, resultText],
    toolCalls: [...state.toolCalls, ...recordedCalls],
    messages: [response],
  };
}

async function verificationNode(state: AgentState): Promise<Partial<AgentState>> {
  const memory = new MemoryFileManager(state.taskId);
  const step = state.plan[state.currentStepIndex];
  const lastResult = state.findings[state.findings.length - 1] || "";

  const llm = getLlm();
  const system = new SystemMessage(
    "You are a verification agent. Determine if the last executed step was successful and complete.\n" +
    "Your reply MUST begin with the single word SUCCESS or FAILURE, followed by a brief explanation."
  );
  const response = await llm.invoke([
    system,
    new HumanMessage(`Step: ${step}\nResult: ${lastResult}`),
  ]);
  await trackUsage(memory, response);
  const verdict = asText(response.content);
  // Objective parse: look at the leading token, not a substring match anywhere.
  const leading = verdict.trim().toUpperCase();
  const success = leading.startsWith("SUCCESS");

  if (success) {
    await memory.checkOffStep(state.currentStepIndex);
    await memory.logProgress(`Step ${state.currentStepIndex + 1} verified`, "SUCCESS");
    return {
      currentStepIndex: state.currentStepIndex + 1,
      stepAttempts: 0,
      messages: [response],
    };
  }

  // Failure: retry the same step up to MAX_STEP_ATTEMPTS, then skip and move on
  // so a single hard step can never stall the whole run.
  const attempts = state.stepAttempts + 1;
  if (attempts < MAX_STEP_ATTEMPTS) {
    await memory.logProgress(
      `Step ${state.currentStepIndex + 1} verification`,
      `FAILURE (will retry, attempt ${attempts}/${MAX_STEP_ATTEMPTS}): ${verdict}`
    );
    return {
      currentStepIndex: state.currentStepIndex,
      stepAttempts: attempts,
      messages: [response],
    };
  }

  await memory.logProgress(
    `Step ${state.currentStepIndex + 1} verification`,
    `FAILURE (max attempts reached, skipping): ${verdict}`
  );
  return {
    currentStepIndex: state.currentStepIndex + 1,
    stepAttempts: 0,
    messages: [response],
  };
}

// Produce a consolidated deliverable. Without this, the agent only ever emits
// per-step findings and never actually answers the user's original request.
async function summaryNode(state: AgentState): Promise<Partial<AgentState>> {
  const memory = new MemoryFileManager(state.taskId);

  let finalOutput: string;
  if (state.plan.length === 0) {
    finalOutput =
      "No actionable plan could be produced for this request. Try rephrasing it with a concrete, achievable goal.";
  } else if (state.findings.length === 0) {
    finalOutput = "The task completed but produced no findings to summarize.";
  } else {
    const llm = getLlm();
    const system = new SystemMessage(
      "You are a synthesis agent. Given the user's original request and the findings gathered across all executed steps, " +
        "write a concise executive summary in markdown that directly answers the request. " +
        "Lead with the answer, then supporting detail. Do not invent facts beyond the findings."
    );
    const human = new HumanMessage(
      `Original request:\n${state.userInput}\n\nFindings:\n${state.findings.join("\n\n")}`
    );
    const response = await llm.invoke([system, human]);
    await trackUsage(memory, response);
    finalOutput = asText(response.content);
  }

  await memory.writeSummary(finalOutput);
  await memory.logProgress("Task completed", "Summary generated");
  taskStore.set(state.taskId, "completed");
  await memory.writeStatus("completed");

  return { finalOutput };
}

function routeAfterStep(state: AgentState): "execution" | "summary" {
  if (state.currentStepIndex < state.plan.length) {
    return "execution";
  }
  return "summary";
}

// Empty plans always skip straight to summary. A non-empty plan goes through
// the one-time "planApproval" checkpoint only when REQUIRE_PLAN_APPROVAL is
// on; otherwise it proceeds straight to execution, preserving the default
// run-to-completion experience.
function routeAfterPlanning(state: AgentState): "planApproval" | "execution" | "summary" {
  if (state.plan.length === 0) return "summary";
  return env.requirePlanApproval() ? "planApproval" : "execution";
}

const workflow = new StateGraph(AgentAnnotation)
  .addNode("planning", planningNode)
  .addNode("planApproval", planApprovalNode)
  .addNode("execution", executionNode)
  .addNode("verification", verificationNode)
  .addNode("summary", summaryNode)
  .addEdge(START, "planning")
  .addConditionalEdges("planning", routeAfterPlanning, {
    planApproval: "planApproval",
    execution: "execution",
    summary: "summary",
  })
  .addEdge("planApproval", "execution")
  .addEdge("execution", "verification")
  .addConditionalEdges("verification", routeAfterStep, {
    execution: "execution",
    summary: "summary",
  })
  .addEdge("summary", END);

// `interruptBefore: ["planApproval"]` only takes effect on runs that reach
// that node (see routeAfterPlanning above) — the checkpointer is required by
// LangGraph for any interrupt to work, so it's always attached; runs that
// never pause simply never touch it.
export const agentApp = workflow.compile({
  checkpointer,
  interruptBefore: ["planApproval"],
});
