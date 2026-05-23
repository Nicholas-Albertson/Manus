import fs from "fs/promises";
import path from "path";

function resolveTaskPath(taskId: string, filePath: string): string {
  const taskRoot = path.join("/tmp", "tasks_data", taskId);
  const resolved = path.resolve(taskRoot, filePath);
  const relative = path.relative(taskRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path must stay within the task workspace");
  }
  return resolved;
}

export async function readFile(args: { taskId: string; filePath: string }): Promise<string> {
  try {
    const resolved = resolveTaskPath(args.taskId, args.filePath);
    return await fs.readFile(resolved, "utf-8");
  } catch (err) {
    return `Error reading file: ${err}`;
  }
}

export async function writeFile(args: { taskId: string; filePath: string; content: string }): Promise<string> {
  try {
    const resolved = resolveTaskPath(args.taskId, args.filePath);
    await fs.writeFile(resolved, args.content);
    return `File written successfully to ${args.filePath}`;
  } catch (err) {
    return `Error writing file: ${err}`;
  }
}
