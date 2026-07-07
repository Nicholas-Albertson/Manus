// Task IDs are server-generated UUIDs. Validating against this pattern before
// using an ID in a filesystem path prevents path traversal.
export const TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTaskId(id: unknown): id is string {
  return typeof id === "string" && TASK_ID_PATTERN.test(id);
}
