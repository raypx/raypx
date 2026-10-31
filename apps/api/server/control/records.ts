import {
  type TaskContextSelection,
  type TaskContextSnapshot,
  type TaskContextTarget,
  activeTaskStatuses,
  type AgentTask,
} from "@raypx/core/tasks";

import { type RelayCommand } from "@raypx/contracts/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";

import type { ControlRecords } from "./schemas.js";

export class ControlError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export type Device = ControlRecords["device"];
export type Grant = ControlRecords["grant"];
export type HostCredential = ControlRecords["credential"];
export type ObservedSession = ControlRecords["observed_session"];
export type ObservedRequest = ControlRecords["observed_request"];
export type Task = ControlRecords["task"];
export type ContextCommand = ControlRecords["command"];
export type RoutedCommand = RelayCommand & { recoveredTask?: AgentTask };
export type ResolveTaskContext = (
  userId: string,
  selection: TaskContextSelection,
  target: TaskContextTarget,
  prompt: string,
) => Promise<TaskContextSnapshot>;
export type Project = ControlRecords["project"];
export type StoredRequest = ControlRecords["request"];
export type Event = ControlRecords["event"];
export interface RelayActor {
  role: "viewer" | "device";
  userId: string;
  sessionId: string;
  deviceId: string;
  epoch: number;
  grantId: string;
  expiresAt: string;
  connectionId: string;
  credentialId?: string;
}
export const required = <T>(value: T | undefined): T => {
  if (!value) throw new ControlError("NOT_FOUND");
  return value;
};
export const hash = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
export const canonical = (value: unknown) =>
  JSON.stringify(normalizeTaskJson(value), (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
export const terminal = (task: AgentTask) => !activeTaskStatuses.includes(task.status);
