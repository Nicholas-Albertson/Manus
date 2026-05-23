import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentState } from "./state";
import { MemoryFileManager } from "./memory";
import { tools } from "./tools";
import { taskStore } from "../store";

function getLlm() {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    temperature: 0,
  });
}

async function planningNode(state: AgentState): Promise<Partial<AgentState>> {
  const memory = new MemoryFileManager(state.taskId);
  await memory.init();
  taskStore.set(state.taskId, "running");

  const llm = getLlm();
  const system = new SystemMessage(
    "You are an AI planning agent. Given a user's request, break it down into a numbered list of actionable steps. " +
    "Each step should be clear and executable by an agent with tools: web_search, execute_python, read_file, write_file. " +
    "Return ONLY the list, one step per line, starting with a dash and space."
  );
  const response = await llm.invoke([system, new HumanMessage(state.userInput)]);
  const content = response.content as string;
  const lines = content
    .split("\n")
    .filter(line => line.trim().startsWith("-"))
    .map(line => line.replace(/^-\s*/, "").trim());

  await memory.writePlan(lines);
  await memory.logProgress("Planning completed", `${lines.length} steps generated`);

  return {
    plan: lines,
    currentStepIndex: 0,
    messages: [response],
  };
}

async function executionNode(state: AgentState): Promise<Partial<AgentState>> {
  const memory = new MemoryFileManager(state.taskId);
  const step = state.plan[state.currentStepIndex];
  await memory.logProgress(`Executing step ${state.currentStepIndex + 1}`, step);

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
  const content = response.content as string;

  let toolCall;
  let resultText = "";
  try {
    const data = JSON.parse(content);
    if (data.tool && tools[data.tool]) {
      const args = { taskId: state.taskId, ...(data.arguments || {}) };
      const result = await tools[data.tool](args);
      toolCall = {
        toolName: data.tool,
        arguments: args,
        result,
        timestamp: new Date(),
      };
      resultText = typeof result === "string" ? result : JSON.stringify(result);
      await memory.appendFinding(`Tool ${data.tool} result: ${result}`);
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
    "Respond with 'SUCCESS' or 'FAILURE' followed by a brief explanation."
  );
  const response = await llm.invoke([
    system,
    new HumanMessage(`Step: ${step}\nResult: ${lastResult}`),
  ]);
  const verdict = response.content as string;

  if (verdict.includes("SUCCESS")) {
    await memory.checkOffStep(state.currentStepIndex);
    await memory.logProgress(`Step ${state.currentStepIndex + 1} verified`, "SUCCESS");
  } else {
    await memory.logProgress(`Step ${state.currentStepIndex + 1} verification`, `FAILURE: ${verdict}`);
  }

  const nextIndex = state.currentStepIndex + 1;
  if (nextIndex >= state.plan.length) {
    taskStore.set(state.taskId, "completed");
    await memory.logProgress("Task completed", "All steps finished");
  }

  return {
    currentStepIndex: nextIndex,
    messages: [response],
  };
}

function shouldContinue(state: AgentState): "execution" | "end" {
  if (state.currentStepIndex < state.plan.length) {
    return "execution";
  }
  return "end";
}

const workflow = new StateGraph<AgentState>({
  channels: {
    taskId: { value: (a, b) => b ?? a },
    userInput: { value: (a, b) => b ?? a },
    plan: { value: (a, b) => b ?? a },
    currentStepIndex: { value: (a, b) => b ?? a },
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
  .addEdge(START, "planning")
  .addEdge("planning", "execution")
  .addEdge("execution", "verification")
  .addConditionalEdges("verification", shouldContinue, {
    execution: "execution",
    end: END,
  });

export const agentApp = workflow.compile();
