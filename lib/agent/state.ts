import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

export interface ToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: Date;
}

// State is defined via LangGraph's Annotation API so the channel types,
// reducers, and node return types are inferred correctly (and type-check under
// `strict`). Scalar channels use last-write-wins; the log-like channels append.
export const AgentAnnotation = Annotation.Root({
  taskId: Annotation<string>,
  userInput: Annotation<string>,
  plan: Annotation<string[]>,
  currentStepIndex: Annotation<number>,
  /** Number of failed attempts for the current step (drives bounded retry). */
  stepAttempts: Annotation<number>,
  findings: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  toolCalls: Annotation<ToolCall[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  finalOutput: Annotation<string | undefined>,
  error: Annotation<string | undefined>,
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

export type AgentState = typeof AgentAnnotation.State;
