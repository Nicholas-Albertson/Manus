// Fast in-memory cache of task status, layered over the durable status.json
// written by MemoryFileManager. The on-disk record is the source of truth and
// survives process restarts (e.g. across a Docker-volume-backed deployment);
// this map just avoids a disk read on the hot path within a single instance.

export type TaskStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

interface TaskRecord {
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

const store = new Map<string, TaskRecord>();

export const taskStore = {
  set: (taskId: string, status: TaskStatus) => {
    const existing = store.get(taskId);
    store.set(taskId, {
      status,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    });
  },
  get: (taskId: string): TaskStatus | undefined => {
    return store.get(taskId)?.status;
  },
  delete: (taskId: string) => {
    store.delete(taskId);
  },
};
