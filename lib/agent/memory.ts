import fs from "fs/promises";
import path from "path";

export class MemoryFileManager {
  private taskDir: string;

  constructor(taskId: string) {
    // Use /tmp for Vercel serverless functions (writable)
    this.taskDir = path.join("/tmp", "tasks_data", taskId);
  }

  async init() {
    await fs.mkdir(this.taskDir, { recursive: true });
  }

  async writePlan(steps: string[]) {
    let content = "# Task Plan\n\n";
    steps.forEach((step) => {
      content += `- [ ] ${step}\n`;
    });
    await fs.writeFile(path.join(this.taskDir, "task_plan.md"), content);
  }

  async checkOffStep(stepIndex: number) {
    const planPath = path.join(this.taskDir, "task_plan.md");
    try {
      const content = await fs.readFile(planPath, "utf-8");
      const lines = content.split("\n");
      let count = 0;
      const newLines = lines.map(line => {
        if (line.startsWith("- [ ]")) {
          if (count === stepIndex) {
            count++;
            return line.replace("[ ]", "[x]");
          }
          count++;
        }
        return line;
      });
      await fs.writeFile(planPath, newLines.join("\n"));
    } catch (err) {
      console.error("Error checking off step:", err);
    }
  }

  async readPlan(): Promise<string> {
    try {
      return await fs.readFile(path.join(this.taskDir, "task_plan.md"), "utf-8");
    } catch {
      return "";
    }
  }

  async appendFinding(finding: string) {
    const timestamp = new Date().toISOString();
    await fs.appendFile(
      path.join(this.taskDir, "findings.md"),
      `\n[${timestamp}] ${finding}\n`
    );
  }

  async logProgress(action: string, result: string = "") {
    const timestamp = new Date().toISOString();
    await fs.appendFile(
      path.join(this.taskDir, "progress.md"),
      `[${timestamp}] ${action}: ${result}\n`
    );
  }

  async getAllFiles() {
    const files: Record<string, string> = {};
    for (const name of ["task_plan.md", "findings.md", "progress.md"]) {
      try {
        files[name] = await fs.readFile(path.join(this.taskDir, name), "utf-8");
      } catch {
        files[name] = "";
      }
    }
    return files;
  }
}
