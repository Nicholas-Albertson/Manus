import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { webSearch } from "./websearch";
import { executePython } from "./pythonExec";
import { readFile, writeFile } from "./fileIO";

export const TOOL_NAMES: ReadonlySet<string> = new Set([
  "web_search",
  "execute_python",
  "read_file",
  "write_file",
]);

/**
 * Build the agent's tools as LangChain structured tools for the given task.
 *
 * `taskId` is closed over here rather than exposed in the schema, so the model
 * never supplies it and file access stays scoped to the task workspace. Each
 * tool delegates to a handler that validates its args and returns a string
 * (errors included), so a tool call can never throw out of the agent loop.
 */
export function buildTools(taskId: string): StructuredToolInterface[] {
  return [
    tool(async ({ query }: { query: string }) => webSearch({ query }), {
      name: "web_search",
      description: "Search the web for up-to-date information about a query.",
      schema: z.object({
        query: z.string().describe("The search query"),
      }),
    }),
    tool(async ({ code }: { code: string }) => executePython({ code }), {
      name: "execute_python",
      description: "Execute a Python code snippet and return its output.",
      schema: z.object({
        code: z.string().describe("Python source code to run"),
      }),
    }),
    tool(
      async ({ filePath }: { filePath: string }) =>
        readFile({ taskId, filePath }),
      {
        name: "read_file",
        description: "Read a file from the task workspace.",
        schema: z.object({
          filePath: z
            .string()
            .describe("Path relative to the task workspace"),
        }),
      }
    ),
    tool(
      async ({ filePath, content }: { filePath: string; content: string }) =>
        writeFile({ taskId, filePath, content }),
      {
        name: "write_file",
        description: "Write a file to the task workspace.",
        schema: z.object({
          filePath: z
            .string()
            .describe("Path relative to the task workspace"),
          content: z.string().describe("File contents to write"),
        }),
      }
    ),
  ];
}

export type AgentTool = ReturnType<typeof buildTools>[number];
