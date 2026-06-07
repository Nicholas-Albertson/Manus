import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentState } from "./state";
import { MemoryFileManager } from "./memory";
import { tools } from "./tools";
import { taskStore } from "../store";

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
    model: process.env.OPENAI_MODEL || "gpt-4o",
    temperature: 0,
  });
}

/** Safely coerce a LangChain message content (string | parts[]) to text. */
function asText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return content == null ? "" : String(content);
}

async function planningNode(state: AgentState): Promise<Partial<AgentState>> {
  const memory = new MemoryFileManager(state.taskId);
  await memory.init();
  taskStore.set(state.taskId, "running");

  const llm = getLlm();
  const system = new SystemMessage(
    "You are an AI planning agent. Given a user's request, break it down into a numbered list of actionable steps. " +
    "Each step should be clear and executable by an agent with tools: web_search, execute_python, read_file, write_file. " +
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

  const llm = getLlm();
  const system = new SystemMessage(
    `You are an execution agent. You have access to these tools: ${Object.keys(tools).join(", ")}.\n` +
      `To use a tool, respond with a JSON object: {"tool": "tool_name", "arguments": {...}}.\n` +
      `Tool argument shapes:\n` +
      `- web_search: {"query": string}\n` +
      `- execute_python: {"code": string}\n` +
      `- read_file: {"filePath": string}  (path relative to the task workspace)\n` +
      `- write_file: {"filePath": string, "content": string}  (path relative to the task workspace)\n` +
      `If no tool is needed, respond with plain text.\n` +
      `Current step: ${step}`
  );
  const response = await llm.invoke([system, new HumanMessage(step)]);
  const content = asText(response.content);

  let toolCall;
  let resultText = "";
  try {
    // Tolerate a fenced ```json block around the tool call.
    const json = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const data = JSON.parse(json);
    if (data.tool && tools[data.tool]) {
      const args = { taskId: state.taskId, ...(data.arguments || {}) };
      const result = await tools[data.tool](args);
      resultText = typeof result === "string" ? result : JSON.stringify(result);
      toolCall = {
        toolName: data.tool,
        arguments: args,
        result,
        timestamp: new Date(),
      };
      await memory.appendFinding(`Tool ${data.tool} result: ${resultText}`);
    } else {
      toolCall = {
        toolName: "llm_response",
        arguments: { response: content },
        result: content,
        timestamp: new Date(),
      };
      resultText = content;
      await memory.appendFinding(`Step ${state.currentStepIndex + 1}: ${content}`);
    }
  } catch {
    toolCall = {
      toolName: "llm_response",
      arguments: { response: content },
      result: content,
      timestamp: new Date(),
    };
    resultText = content;
    await memory.appendFinding(`Step ${state.currentStepIndex + 1}: ${content}`);
  }

  return {
    findings: [...state.findings, resultText],
    toolCalls: [...state.toolCalls, toolCall],
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

  return { finalOutput };
}

function routeAfterStep(state: AgentState): "execution" | "summary" {
  if (state.currentStepIndex < state.plan.length) {
    return "execution";
  }
  return "summary";
}

const workflow = new StateGraph<AgentState>({
  channels: {
    taskId: { value: (a, b) => b ?? a },
    userInput: { value: (a, b) => b ?? a },
    plan: { value: (a, b) => b ?? a },
    currentStepIndex: { value: (a, b) => b ?? a },
    stepAttempts: { value: (a, b) => b ?? a },
    findings: { value: (a, b) => a.concat(b) },
    toolCalls: { value: (a, b) => a.concat(b) },
    finalOutput: { value: (a, b) => b ?? a },
    error: { value: (a, b) => b ?? a },
    messages: { value: (a, b) => a.concat(b) },
  },
})
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
