import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentAnnotation, type AgentState } from "./state";
import { MemoryFileManager } from "./memory";
import { buildTools, TOOL_NAMES } from "./tools";
import { taskStore } from "../store";
import { asText } from "./text";
import type { ToolCall } from "./state";
import { env } from "../env";

// --- Guardrails ------------------------------------------------------------
// These bound total work (and therefore token spend) deterministically, which
// is the single most common failure mode of autonomous agents: unbounded
// loops and runaway API bills. The maximum number of LLM calls for a run is
// 1 (plan) + MAX_PLAN_STEPS * MAX_STEP_ATTEMPTS * 2 (exec+verify) + 1 (summary).
export const MAX_PLAN_STEPS = 12;
export const MAX_STEP_ATTEMPTS = 2; // 1 initial try + up to 1 retry per step
// LangGraph counts supersteps; set generously above the worst-case path so a
// legitimate long run never trips it, while a runaway cycle still terminates.
export const RECURSION_LIMIT =
  2 + MAX_PLAN_STEPS * MAX_STEP_ATTEMPTS * 2 + 4;

function getLlm() {
  return new ChatOpenAI({
    model: env.openAiModel(),
    temperature: 0,
  });
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
  const content = asText(response.content);
  const lines = content
    .split("\n")
    .filter(line => line.trim().startsWith("-"))
    .map(line => line.replace(/^-\s*/, "").trim())
    .filter(line => line.length > 0)
    .slice(0, MAX_PLAN_STEPS);

  await memory.writePlan(lines);
  await memory.logProgress("Planning completed", `${lines.length} steps generated`);

  return {
    plan: lines,
    currentStepIndex: 0,
    stepAttempts: 0,
    messages: [response],
  };
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

const workflow = new StateGraph(AgentAnnotation)
  .addNode("planning", planningNode)
  .addNode("execution", executionNode)
  .addNode("verification", verificationNode)
  .addNode("summary", summaryNode)
  .addEdge(START, "planning")
  // Empty plans route straight to summary instead of dead-ending in "running".
  .addConditionalEdges("planning", routeAfterStep, {
    execution: "execution",
    summary: "summary",
  })
  .addEdge("execution", "verification")
  .addConditionalEdges("verification", routeAfterStep, {
    execution: "execution",
    summary: "summary",
  })
  .addEdge("summary", END);

export const agentApp = workflow.compile();
