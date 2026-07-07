import fs from "fs/promises";
import path from "path";
import type { TaskStatus } from "../store";
import { addUsage, emptyUsageTotals, type LlmUsage, type UsageTotals } from "./cost";

export interface StatusRecord {
  status: TaskStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export class MemoryFileManager {
  private taskDir: string;

  constructor(taskId: string) {
    // Artifacts live under /tmp so the app works on read-only deployments;
    // mount this path on a persistent volume to retain task history.
    this.taskDir = path.join("/tmp", "tasks_data", taskId);
  }

  async init() {
    await fs.mkdir(this.taskDir, { recursive: true });
  }

  /** Durable status, written alongside the task artifacts. */
  async writeStatus(status: TaskStatus, error: string | null = null) {
    const statusPath = path.join(this.taskDir, "status.json");
    const existing = await this.readStatus();
    const record: StatusRecord = {
      status,
      error,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(statusPath, JSON.stringify(record, null, 2));
  }

  async readStatus(): Promise<StatusRecord | null> {
    try {
      const raw = await fs.readFile(path.join(this.taskDir, "status.json"), "utf-8");
      return JSON.parse(raw) as StatusRecord;
    } catch {
      return null;
    }
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

  async writeSummary(content: string) {
    await fs.writeFile(path.join(this.taskDir, "summary.md"), content);
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

  /** Cumulative token usage + estimated cost across every LLM call in this task. */
  async readUsage(): Promise<UsageTotals> {
    try {
      const raw = await fs.readFile(path.join(this.taskDir, "usage.json"), "utf-8");
      return JSON.parse(raw) as UsageTotals;
    } catch {
      return emptyUsageTotals();
    }
  }

  async recordUsage(model: string, usage: LlmUsage): Promise<UsageTotals> {
    const current = await this.readUsage();
    const updated = addUsage(current, model, usage);
    await fs.writeFile(
      path.join(this.taskDir, "usage.json"),
      JSON.stringify(updated, null, 2)
    );
    return updated;
  }

  async getAllFiles() {
    const files: Record<string, string> = {};
    for (const name of ["task_plan.md", "findings.md", "progress.md", "summary.md"]) {
      try {
        files[name] = await fs.readFile(path.join(this.taskDir, name), "utf-8");
      } catch {
        files[name] = "";
      }
    }
    return files;
  }
}
