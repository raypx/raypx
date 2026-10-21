import type { AgentTask } from "@raypx/contracts/tasks";
export type { AgentTask, HumanRequest, HumanDecision, SyncDevice } from "@raypx/contracts/tasks";
export function isTaskActive(task: Pick<AgentTask, "status">) {
  return ["pending", "running", "waiting", "cancelling"].includes(task.status);
}
/** Keep summaries ordered while replacing stale account-owned snapshots atomically. */
export function taskCursor(task: Pick<AgentTask, "id" | "createdAt">) {
  return `${task.createdAt}:${task.id}`;
}
