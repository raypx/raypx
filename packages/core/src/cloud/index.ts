import { DomainError } from "@voidmix/shared";
import type { ProjectV2, ProjectMemberV2, OrganizationMemberV2, OutboxEvent } from "../index.js";

export type ResourceScope =
  | { type: "personal"; ownerUserId: string }
  | { type: "project"; projectId: string };
export type CloudTaskStatus =
  | "open"
  | "in_progress"
  | "waiting_input"
  | "review"
  | "completed"
  | "cancelled";
export type CloudRunStatus =
  | "queued"
  | "running"
  | "needs_input"
  | "succeeded"
  | "failed"
  | "cancelled";
export type CloudMode = "search" | "computer";
export interface CloudResource {
  id: string;
  scope: ResourceScope;
  createdAt: Date;
  updatedAt: Date;
}
export interface CloudConversation extends CloudResource {
  title: string;
  createdByUserId: string;
  idempotencyKey: string;
}
export interface CloudTurn extends CloudResource {
  conversationId: string;
  actorId: string;
  prompt: string;
  mode: CloudMode;
  runId: string;
  attachmentIds: string[];
  idempotencyKey: string;
}
export interface CloudTask extends CloudResource {
  title: string;
  goal: string;
  currentRoundId: string;
  goalVersion: number;
  requestedByUserId: string;
  status: CloudTaskStatus;
  conversationId: string | null;
  currentRevisionId: string | null;
  acceptedRevisionId: string | null;
  idempotencyKey: string;
}
/** A goal and its budget are immutable; continuing and retrying retain this identity. */
export interface CloudTaskRound extends CloudResource {
  taskId: string;
  goalVersion: number;
  goal: string;
  attachmentIds: string[];
  callBudget: number;
  /** Each Run in the round receives this allowance; retries do not replenish callBudget. */
  durationBudgetMs: number;
  createdByUserId: string;
  idempotencyKey: string;
}
export function sameCloudTaskRound(left: CloudTaskRound, right: CloudTaskRound): boolean {
  return (
    left.id === right.id &&
    sameResourceScope(left.scope, right.scope) &&
    left.taskId === right.taskId &&
    left.goalVersion === right.goalVersion &&
    left.goal === right.goal &&
    JSON.stringify(left.attachmentIds) === JSON.stringify(right.attachmentIds) &&
    left.callBudget === right.callBudget &&
    left.durationBudgetMs === right.durationBudgetMs &&
    left.createdByUserId === right.createdByUserId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.createdAt.getTime() === right.createdAt.getTime() &&
    left.updatedAt.getTime() === right.updatedAt.getTime()
  );
}
export interface CloudSpendingGrant extends CloudResource {
  actorId: string;
  grantedByUserId: string;
  allowed: boolean;
}
export interface CloudMessage extends CloudResource {
  runId: string;
  messageId: string;
  executionId: string | null;
  text: string;
  completed: boolean;
  sequence: number;
}
export interface CloudExecutionGrant extends CloudResource {
  runId: string;
  ownerId: string;
  epoch: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  actions: string[];
}
export interface CloudRun extends CloudResource {
  conversationId: string;
  turnId: string;
  sourceTurnId?: string;
  taskId: string | null;
  roundId: string | null;
  ownerAccountId: string;
  requestedByUserId: string;
  mode: CloudMode;
  prompt: string;
  attachmentIds: string[];
  status: CloudRunStatus;
  attempt: number;
  retryOfRunId: string | null;
  lastSequence: number;
  ownerId: string | null;
  epoch: number;
  heartbeatAt: Date | null;
  leaseExpiresAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelRequested: boolean;
  output: string | null;
  error: string | null;
  dispatchReady: boolean;
}
export interface CloudAgentExecution extends CloudResource {
  runId: string;
  parentId: string | null;
  role: string;
  prompt: string;
  status: CloudRunStatus;
  output: string | null;
  depth: number;
}
export interface CloudToolExecution extends CloudResource {
  runId: string;
  executionId: string;
  name: string;
  input: unknown;
  output: unknown;
  status: "running" | "succeeded" | "failed" | "cancelled";
}
export interface CloudSourceEvidence extends CloudResource {
  runId: string;
  url: string;
  title: string;
  excerpt: string;
}
export interface CloudAssetVersion extends CloudResource {
  requestedByUserId: string;
  ownerAccountId: string;
  name: string;
  objectKey: string;
  mediaType: string;
  byteSize: number;
  checksum: string;
  published: boolean;
  verifiedAt: Date | null;
  /** Internal durable object cleanup claim; never part of the public DTO. */
  cleanupClaimed?: boolean;
  uploadId: string;
  idempotencyKey: string;
  runId: string | null;
  expiresAt: Date;
}
export interface CloudArtifactRevision extends CloudResource {
  taskId: string;
  roundId: string;
  goalVersion: number;
  runId: string;
  assetVersionIds: string[];
  summary: string;
  revision: number;
}
export interface CloudUsageCall extends CloudResource {
  runId: string;
  roundId: string | null;
  executionId: string;
  accountId: string;
  provider: string;
  model: string;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    cacheWritePerMillion?: number;
  } | null;
  state: "reserved" | "started" | "settled" | "unknown" | "released";
  reservedTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  estimatedCost: number | null;
  settledAt: Date | null;
}
export interface CloudNotification extends CloudResource {
  recipientId: string;
  taskId: string | null;
  conversationId: string | null;
  runId: string | null;
  type: "task.review" | "run.failed" | "task.waiting_input" | "task.completed";
  readAt: Date | null;
  emailEnabled: boolean;
  emailDeliveredAt: Date | null;
}
export interface CloudCommand extends CloudResource {
  runId: string;
  actorId: string;
  idempotencyKey: string;
  type: "cancel" | "steer";
  text: string | null;
  status: "pending" | "applied" | "rejected";
}
export type CloudEventType =
  | "message.delta"
  | "message.completed"
  | "tool.started"
  | "tool.completed"
  | "source.created"
  | "execution.started"
  | "execution.completed"
  | "run.status"
  | "artifact.published"
  | "usage.settled";
export interface CloudRunEvent {
  runId: string;
  sequence: number;
  occurredAt: Date;
  type: CloudEventType;
  executionId: string | null;
  payload: Record<string, unknown>;
  eventId: string;
}
export interface CloudRunSnapshot {
  run: CloudRun;
  events: CloudRunEvent[];
  messages: CloudMessage[];
  executions: CloudAgentExecution[];
  sources: CloudSourceEvidence[];
  artifacts: CloudAssetVersion[];
  commands: CloudCommand[];
  cursor: number;
  historyTruncated: boolean;
  historyCursor: number | null;
}
export interface CloudMutation extends CloudResource {
  actorId: string;
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  response: unknown;
}
export interface CloudPreferences extends CloudResource {
  actorId: string;
  emailEnabled: boolean;
  locale: "en" | "zh";
}
export interface CloudEntities {
  mutations: CloudMutation;
  preferences: CloudPreferences;
  conversations: CloudConversation;
  turns: CloudTurn;
  tasks: CloudTask;
  rounds: CloudTaskRound;
  spendingGrants: CloudSpendingGrant;
  messages: CloudMessage;
  executionGrants: CloudExecutionGrant;
  runs: CloudRun;
  executions: CloudAgentExecution;
  tools: CloudToolExecution;
  sources: CloudSourceEvidence;
  assets: CloudAssetVersion;
  revisions: CloudArtifactRevision;
  usage: CloudUsageCall;
  notifications: CloudNotification;
  commands: CloudCommand;
}
export type CloudEntityKind = keyof CloudEntities;
export interface CloudQuery {
  scope?: ResourceScope;
  parentId?: string;
  actorId?: string;
  ownerAccountId?: string;
  roundId?: string;
  idempotencyKey?: string;
  limit?: number;
  status?: CloudRunStatus;
  published?: boolean;
  turnIds?: readonly string[];
  /** Restricts child facts, especially the shared Task usage ledger, to known parent Runs. */
  runIds?: readonly string[];
  before?: { createdAt: Date; id: string };
}
export interface CloudTransaction {
  lock(keys: readonly string[]): Promise<void>;
  activeTaskRun(taskId: string): Promise<CloudRun | null>;
  readyRuns(limit: number): Promise<CloudRun[]>;
  expiredRuns(now: Date, limit: number): Promise<CloudRun[]>;
  get<K extends CloudEntityKind>(kind: K, id: string): Promise<CloudEntities[K] | null>;
  list<K extends CloudEntityKind>(kind: K, query?: CloudQuery): Promise<CloudEntities[K][]>;
  remove<K extends CloudEntityKind>(kind: K, id: string): Promise<void>;
  save<K extends CloudEntityKind>(kind: K, entity: CloudEntities[K]): Promise<void>;
  userActive(actorId: string): Promise<boolean>;
  userProfile(
    actorId: string,
  ): Promise<{ email: string; displayName: string; role: "user" | "admin" | "owner" } | null>;
  projectAccess(
    projectId: string,
    actorId: string,
  ): Promise<{
    project: ProjectV2;
    projectMember: ProjectMemberV2 | null;
    organizationMember: OrganizationMemberV2 | null;
  } | null>;
  appendEvent(event: CloudRunEvent): Promise<void>;
  events(runId: string, afterSequence: number, limit: number): Promise<CloudRunEvent[]>;
  eventsBefore(runId: string, beforeSequence: number, limit: number): Promise<CloudRunEvent[]>;
  eventById(runId: string, eventId: string): Promise<CloudRunEvent | null>;
  enqueue(event: OutboxEvent): Promise<void>;
}
/** Lock keys represent actors, tasks, and runs; every statement uses the transaction handle. */
export interface CloudRepository {
  read<T>(operation: (tx: CloudTransaction) => Promise<T>): Promise<T>;
  transaction<T>(
    keys: readonly string[],
    operation: (tx: CloudTransaction) => Promise<T>,
  ): Promise<T>;
}
export interface CloudUsageSummary {
  calls: number;
  reservedCalls: number;
  unknownCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  storageBytes: number;
  activeRuns: number;
  limits: CloudLimits;
}
export interface CloudLimits {
  accountCalls: number;
  accountConcurrentRuns: number;
  accountStorageBytes: number;
  taskCalls: number;
  taskDurationMs: number;
  singleCallMaxTokens: number;
}
export const defaultCloudLimits: CloudLimits = {
  accountCalls: 100,
  accountConcurrentRuns: 2,
  accountStorageBytes: 100 * 1024 * 1024,
  taskCalls: 40,
  taskDurationMs: 20 * 60 * 1000,
  singleCallMaxTokens: 32_000,
};
export type CloudErrorCode =
  | "CLOUD_ACCESS_DENIED"
  | "CLOUD_NOT_FOUND"
  | "CLOUD_INVALID_INPUT"
  | "CLOUD_RUN_ACTIVE"
  | "CLOUD_RUN_TERMINAL"
  | "CLOUD_OWNER_INVALID"
  | "CLOUD_BUDGET_EXCEEDED"
  | "CLOUD_IDEMPOTENCY_CONFLICT"
  | "CLOUD_REVISION_INVALID";
export class CloudDomainError extends DomainError<CloudErrorCode> {
  constructor(code: CloudErrorCode, message: string) {
    super(code, message);
    this.name = "CloudDomainError";
  }
}
export const isCloudTerminal = (status: CloudRunStatus): boolean =>
  status === "needs_input" ||
  status === "succeeded" ||
  status === "failed" ||
  status === "cancelled";
export function sameResourceScope(a: ResourceScope, b: ResourceScope): boolean {
  return a.type === "personal"
    ? b.type === "personal" && a.ownerUserId === b.ownerUserId
    : b.type === "project" && a.projectId === b.projectId;
}
export interface ObjectMetadata {
  key: string;
  byteSize: number;
  contentType: string;
  checksumSha256: string;
}
export interface SignedObjectRequest {
  url: string;
  method: "GET";
  headers: Record<string, string>;
  expiresAt: Date;
}
export interface SignedObjectUpload {
  url: string;
  method: "POST";
  fields: Record<string, string>;
  headers: Record<string, string>;
  expiresAt: Date;
}
export interface ObjectStorage {
  close?(): Promise<void>;
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    checksumSha256: string;
  }): Promise<ObjectMetadata>;
  head(key: string): Promise<ObjectMetadata | null>;
  read(key: string): Promise<{ metadata: ObjectMetadata; body: AsyncIterable<Uint8Array> } | null>;
  remove(key: string): Promise<void>;
  signUpload(input: {
    key: string;
    byteSize: number;
    contentType: string;
    checksumSha256: string;
    expiresInSeconds?: number;
  }): Promise<SignedObjectUpload>;
  signDownload(input: {
    key: string;
    filename?: string;
    expiresInSeconds?: number;
  }): Promise<SignedObjectRequest>;
}
