import {
  type TaskContextSelection,
  type TaskContextSnapshot,
  type TaskContextTarget,
  activeTaskStatuses,
  type AgentTask,
  type AgentEvent,
  type HumanRequest,
} from "@raypx/core/tasks";

import type { TerminalRequest, TerminalSession } from "@raypx/contracts/terminal";
import {
  type RelayClientFrame,
  type RelayCommand,
  type RelayRequest,
} from "@raypx/contracts/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";

import type { ControlRecord } from "./repository.js";

export class ControlError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface Device extends ControlRecord {
  installationId: string;
  name: string;
  platform: string;
  appVersion: string;
  epoch: number;
  revoked: boolean;
  lastSeenAt: string | null;
  streamId: string | null;
  instanceId: string | null;
  connectionId: string | null;
  cursor: number;
  initialized: boolean;
  capabilities: Extract<RelayClientFrame, { type: "announce" }>["capabilities"];
}
export interface Grant extends ControlRecord {
  userId: string;
  sessionId: string;
  epoch: number;
  expiresAt: string;
  parentExpiresAt: string;
  role: "device" | "viewer";
  credentialId?: string;
}
export interface HostCredential extends ControlRecord {
  userId: string;
  bootstrapSessionId?: string;
  securityVersion?: string;
  epoch: number;
  expiresAt: string;
}
export type ObservedSession = TerminalSession & ControlRecord;
export type ObservedRequest = TerminalRequest & ControlRecord & { serverCancelled?: true };
export interface Task extends AgentTask {
  epoch: number;
}
export interface ContextCommand extends ControlRecord {
  request?: RelayRequest;
  context?: TaskContextSnapshot;
  requestHash?: string;
  capturedAt?: string;
  compacted?: true;
}
export type RoutedCommand = RelayCommand & { recoveredTask?: AgentTask };
export type ResolveTaskContext = (
  userId: string,
  selection: TaskContextSelection,
  target: TaskContextTarget,
  prompt: string,
) => Promise<TaskContextSnapshot>;
export interface Project extends ControlRecord {
  projectId: string;
  name: string;
  providers: ("codex" | "claude")[];
  dirty: boolean;
}
export interface StoredRequest extends HumanRequest {
  deviceId: string;
}
export interface Event extends ControlRecord {
  taskId: string;
  streamId: string;
  cursor: number;
  event: AgentEvent;
}
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
