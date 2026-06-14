import fs from "fs/promises";
import path from "path";
import { z } from "zod";

export function resolveTaskPath(taskId: string, filePath: string): string {
  const taskRoot = path.join("/tmp", "tasks_data", taskId);
  const resolved = path.resolve(taskRoot, filePath);
  const relative = path.relative(taskRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path must stay within the task workspace");
  }
  return resolved;
}

const readFileArgsSchema = z.object({
  taskId: z.string().min(1),
  filePath: z.string().min(1),
});

const writeFileArgsSchema = z.object({
  taskId: z.string().min(1),
  filePath: z.string().min(1),
  content: z.string(),
});

export async function readFile(args: unknown): Promise<string> {
  const parsedArgs = readFileArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    return "Error: read_file expects { taskId: string, filePath: string }";
  }

  try {
    const resolved = resolveTaskPath(parsedArgs.data.taskId, parsedArgs.data.filePath);
    return await fs.readFile(resolved, "utf-8");
  } catch (err) {
    return `Error reading file: ${err}`;
  }
}

export async function writeFile(args: unknown): Promise<string> {
  const parsedArgs = writeFileArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    return "Error: write_file expects { taskId: string, filePath: string, content: string }";
  }

  try {
    const resolved = resolveTaskPath(parsedArgs.data.taskId, parsedArgs.data.filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, parsedArgs.data.content, "utf-8");
    return `File written successfully to ${parsedArgs.data.filePath}`;
  } catch (err) {
    return `Error writing file: ${err}`;
  }
}
