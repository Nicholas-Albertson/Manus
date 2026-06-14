import type { BaseMessage } from "@langchain/core/messages";

export interface ToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: Date;
}

export interface AgentState {
  [key: string]: unknown;
  taskId: string;
  userInput: string;
  plan: string[];
  currentStepIndex: number;
  /** Number of failed attempts for the current step (drives bounded retry). */
  stepAttempts: number;
  findings: string[];
  toolCalls: ToolCall[];
  finalOutput?: string;
  error?: string;
  messages: BaseMessage[];
}
