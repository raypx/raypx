import { DomainError } from "@voidmix/shared";
import type { AgentRunStatusV2 } from "./runs.js";

export interface ExecutionDevice {
  id: string;
  ownerUserId: string;
  name: string;
  platform: string;
  credentialHash: string;
  registrationKey: string;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type PublicExecutionDevice = Omit<ExecutionDevice, "credentialHash" | "registrationKey">;
export interface DeviceProjectBinding {
  deviceId: string;
  projectId: string;
  localBindingId: string;
  enabled: boolean;
  tools: string[];
  model: { provider: string; id: string } | null;
  updatedAt: Date;
}
export interface TaskRun {
  id: string;
  projectId: string;
  taskId: string;
  targetDeviceId: string;
  requestedByUserId: string;
  assetVersionId: string | null;
  status: AgentRunStatusV2;
  attempt: number;
  retryOfRunId: string | null;
  prompt: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  lastSeq: number;
  claimId: string | null;
  acceptedAt: Date | null;
  completedAt: Date | null;
  pendingApprovalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  idempotencyKey: string;
  dispatchReady: boolean;
}
export type PublicTaskRun = Omit<TaskRun, "idempotencyKey" | "dispatchReady">;
type EventBase = { runId: string; seq: number; occurredAt: Date };
export type RunEvent = EventBase &
  (
    | { type: "message.delta"; payload: { messageId: string; text: string; roleId?: string } }
    | { type: "message.completed"; payload: { messageId: string; text: string; roleId?: string } }
    | { type: "tool.started"; payload: { callId: string; name: string; input: unknown } }
    | {
        type: "tool.completed";
        payload: { callId: string; name: string; output: unknown; isError?: boolean };
      }
    | {
        type: "run.status";
        payload: {
          status: AgentRunStatusV2;
          error?: string | null;
          output?: Record<string, unknown> | null;
        };
      }
    | { type: "approval.requested"; payload: { approvalId: string; prompt: string } }
    | { type: "approval.resolved"; payload: { approvalId: string; decision: "approve" | "deny" } }
    | {
        type: "artifact.created";
        payload: { assetVersionId: string; name: string; mediaType: string };
      }
  );
export const runCommandTypes = ["cancel", "steer", "approval"] as const;
export const runCommandStatuses = ["pending", "applied", "rejected"] as const;
export interface RunCommand {
  id: string;
  runId: string;
  requestedByUserId: string;
  idempotencyKey: string;
  type: (typeof runCommandTypes)[number];
  payload: Record<string, unknown>;
  status: (typeof runCommandStatuses)[number];
  error: string | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
}
export interface RunArtifact {
  id: string;
  runId: string;
  assetVersionId: string;
  name: string;
  createdAt: Date;
}
export interface ExecutionTransaction {
  getDevice(id: string): Promise<ExecutionDevice | null>;
  findDeviceByHash(hash: string): Promise<ExecutionDevice | null>;
  listDevices(ownerUserId: string): Promise<ExecutionDevice[]>;
  saveDevice(device: ExecutionDevice): Promise<void>;
  getBinding(deviceId: string, projectId: string): Promise<DeviceProjectBinding | null>;
  listBindings(deviceId: string): Promise<DeviceProjectBinding[]>;
  saveBinding(binding: DeviceProjectBinding): Promise<void>;
  getRun(id: string): Promise<TaskRun | null>;
  listRuns(projectId: string, taskId?: string): Promise<TaskRun[]>;
  listDeviceRuns(deviceId: string): Promise<TaskRun[]>;
  findRunIntent(actorId: string, idempotencyKey: string): Promise<TaskRun | null>;
  saveRun(run: TaskRun): Promise<void>;
  queueRun(run: TaskRun): Promise<void>;
  listEvents(runId: string, afterSeq: number, limit: number): Promise<RunEvent[]>;
  getEvent(runId: string, seq: number): Promise<RunEvent | null>;
  appendEvent(event: RunEvent): Promise<void>;
  listCommands(runId: string): Promise<RunCommand[]>;
  saveCommand(command: RunCommand): Promise<void>;
  listArtifacts(runId: string): Promise<RunArtifact[]>;
  saveArtifact(artifact: RunArtifact): Promise<void>;
}
/** Mutations are serialized and commit together; read transactions may run without a write lock. */
export interface ExecutionRepository {
  read<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T>;
  transaction<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T>;
}
export type ExecutionErrorCode =
  | "EXECUTION_ACCESS_DENIED"
  | "DEVICE_UNAUTHORIZED"
  | "DEVICE_NOT_BOUND"
  | "RUN_NOT_FOUND"
  | "RUN_ACTIVE"
  | "RUN_TERMINAL"
  | "RUN_INVALID_TRANSITION"
  | "RUN_EVENT_GAP"
  | "RUN_EVENT_CONFLICT"
  | "RUN_CLAIM_INVALID"
  | "COMMAND_INVALID"
  | "IDEMPOTENCY_CONFLICT";
export class ExecutionDomainError extends DomainError<ExecutionErrorCode> {
  constructor(code: ExecutionErrorCode, message: string) {
    super(code, message);
    this.name = "ExecutionDomainError";
  }
}
export const terminalRunStatuses: ReadonlySet<AgentRunStatusV2> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);
export function publicDevice({
  credentialHash: _hash,
  registrationKey: _key,
  ...device
}: ExecutionDevice): PublicExecutionDevice {
  return device;
}
export function publicRun({
  idempotencyKey: _key,
  dispatchReady: _ready,
  ...run
}: TaskRun): PublicTaskRun {
  return run;
}
export function assertRunTransition(from: AgentRunStatusV2, to: AgentRunStatusV2): void {
  if (from === to) return;
  if (
    terminalRunStatuses.has(from) ||
    from === "queued" ||
    (from === "waiting_for_approval" && to === "succeeded")
  )
    throw new ExecutionDomainError(
      "RUN_INVALID_TRANSITION",
      "Run state transition is not allowed.",
    );
}
