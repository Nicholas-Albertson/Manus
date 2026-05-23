import { webSearch } from "./websearch";
import { executePython } from "./pythonExec";
import { readFile, writeFile } from "./fileIO";

export const tools: Record<string, (args: any) => Promise<string>> = {
  web_search: webSearch,
  execute_python: executePython,
  read_file: readFile,
  write_file: writeFile,
};
