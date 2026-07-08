// LangGraph checkpoint storage for the agent graph. Persisted to a SQLite
// file (not in-memory) so an interrupted run — most importantly, a task
// paused at the plan-approval checkpoint (see graph.ts) — survives a process
// restart, and can be resumed by *any* process that shares the file, not
// just the one that paused it. That file lives under the same
// /tmp/tasks_data root as task artifacts, so it rides the same Docker volume
// (and the same durable-queue `web`/`worker` split) with no new
// infrastructure or config required.
import fs from "fs";
import path from "path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

const DEFAULT_CHECKPOINT_DB_PATH = path.join("/tmp", "tasks_data", "checkpoints.db");

export function checkpointDbPath(): string {
  return process.env.CHECKPOINT_DB_PATH || DEFAULT_CHECKPOINT_DB_PATH;
}

export function createCheckpointer(): BaseCheckpointSaver {
  const dbPath = checkpointDbPath();
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  return SqliteSaver.fromConnString(dbPath);
}
