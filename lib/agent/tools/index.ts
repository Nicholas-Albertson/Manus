import { webSearch } from "./websearch";
import { executePython } from "./pythonExec";
import { readFile, writeFile } from "./fileIO";

export type ToolHandler = (args: unknown) => Promise<string>;

export const tools: Record<string, ToolHandler> = {
  web_search: webSearch,
  execute_python: executePython,
  read_file: readFile,
  write_file: writeFile,
};
