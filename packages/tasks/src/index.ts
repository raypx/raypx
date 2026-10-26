import { activeTaskStatuses, type AgentTask } from "@raypx/core/tasks";
export type { AgentTask, HumanRequest, HumanDecision } from "@raypx/core/tasks";
export type { SyncDevice } from "@raypx/contracts/tasks";
export function isTaskActive(task: Pick<AgentTask, "status">) {
  return activeTaskStatuses.includes(task.status);
}
/** Keep summaries ordered while replacing stale account-owned snapshots atomically. */
export function taskCursor(task: Pick<AgentTask, "id" | "createdAt">) {
  return `${task.createdAt}:${task.id}`;
}
