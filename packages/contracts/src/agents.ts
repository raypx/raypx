import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import { resourceFields, procedure } from "./common.js";

export const agentRunStatusV2Schema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "succeeded",
  "failed",
  "cancelled",
]);
export const deviceSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  name: z.string(),
  platform: z.string(),
  revokedAt: z.date().nullable(),
  lastSeenAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export const deviceBindingSchema = z.object({
  deviceId: z.string(),
  projectId: z.string(),
  localBindingId: z.string(),
  enabled: z.boolean(),
  tools: z.array(z.string()),
  model: z.object({ provider: z.string(), id: z.string() }).nullable(),
  updatedAt: z.date(),
});
export const agentRunV2Schema = z.object({
  ...resourceFields,
  taskId: z.string(),
  targetDeviceId: z.string(),
  requestedByUserId: z.string(),
  assetVersionId: z.string().nullable(),
  status: agentRunStatusV2Schema,
  attempt: z.number().int().positive(),
  retryOfRunId: z.string().nullable(),
  prompt: z.string(),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  lastSeq: z.number().int().nonnegative(),
  claimId: z.string().nullable(),
  acceptedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  pendingApprovalId: z.string().nullable(),
});
const eventFields = {
  runId: z.string().min(1),
  seq: z.number().int().positive(),
  occurredAt: z.date(),
};
export const runEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventFields,
    type: z.literal("message.delta"),
    payload: z.object({
      messageId: z.string().min(1),
      text: z.string().max(65536),
      roleId: z.string().optional(),
    }),
  }),
  z.object({
    ...eventFields,
    type: z.literal("message.completed"),
    payload: z.object({
      messageId: z.string().min(1),
      text: z.string().max(1_000_000),
      roleId: z.string().optional(),
    }),
  }),
  z.object({
    ...eventFields,
    type: z.literal("tool.started"),
    payload: z.object({ callId: z.string(), name: z.string(), input: z.unknown() }),
  }),
  z.object({
    ...eventFields,
    type: z.literal("tool.completed"),
    payload: z.object({
      callId: z.string(),
      name: z.string(),
      output: z.unknown(),
      isError: z.boolean().optional(),
    }),
  }),
  z.object({
    ...eventFields,
    type: z.literal("run.status"),
    payload: z.object({
      status: agentRunStatusV2Schema,
      error: z.string().nullable().optional(),
      output: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  }),
  z.object({
    ...eventFields,
    type: z.literal("approval.requested"),
    payload: z.object({ approvalId: z.string(), prompt: z.string() }),
  }),
  z.object({
    ...eventFields,
    type: z.literal("approval.resolved"),
    payload: z.object({ approvalId: z.string(), decision: z.enum(["approve", "deny"]) }),
  }),
  z.object({
    ...eventFields,
    type: z.literal("artifact.created"),
    payload: z.object({ assetVersionId: z.string(), name: z.string(), mediaType: z.string() }),
  }),
]);
export const runCommandSchema = z.object({
  id: z.string(),
  runId: z.string(),
  requestedByUserId: z.string(),
  idempotencyKey: z.string(),
  type: z.enum(["cancel", "steer", "approval"]),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "applied", "rejected"]),
  error: z.string().nullable(),
  createdAt: z.date(),
  acknowledgedAt: z.date().nullable(),
});
export const runArtifactSchema = z.object({
  id: z.string(),
  runId: z.string(),
  assetVersionId: z.string(),
  name: z.string(),
  createdAt: z.date(),
});
export const runSnapshotSchema = z.object({
  run: agentRunV2Schema,
  events: z.array(runEventSchema),
  commands: z.array(runCommandSchema),
  artifacts: z.array(runArtifactSchema),
  earliestSeq: z.number().int().nonnegative(),
  historyTruncated: z.boolean(),
});
const runKey = { runId: z.string().min(1) };
const intentKey = { ...runKey, idempotencyKey: z.string().trim().min(1).max(200) };
const deviceRunKey = { ...runKey, claimId: z.string().min(1) };
const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });
export const v2CreateAgentRun = procedure(
  {
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    targetDeviceId: z.string().min(1),
    prompt: z.string().trim().min(1).max(65536),
    idempotencyKey: z.string().trim().min(1).max(200),
    input: z.record(z.string(), z.unknown()).default({}),
  },
  agentRunV2Schema,
);
export const v2ListAgentRuns = procedure(
  {
    projectId: z.string(),
    taskId: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  },
  page(agentRunV2Schema),
);
export const v2GetAgentRun = procedure(runKey, agentRunV2Schema);
export const v2CancelAgentRun = procedure(
  intentKey,
  z.object({ run: agentRunV2Schema, command: runCommandSchema }),
);
export const v2RetryAgentRun = procedure(intentKey, agentRunV2Schema);
export const getRunSnapshot = procedure(runKey, runSnapshotSchema);
export const listRunEvents = procedure(
  {
    ...runKey,
    afterSeq: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(200).default(100),
  },
  z.object({
    items: z.array(runEventSchema),
    nextSeq: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
);
export const streamRunEvents = oc
  .input(z.object({ ...runKey, afterSeq: z.number().int().nonnegative().default(0) }))
  .output(eventIterator(runEventSchema));
export const createRunCommand = procedure(
  {
    ...intentKey,
    type: z.enum(["cancel", "steer", "approval"]),
    payload: z.record(z.string(), z.unknown()).default({}),
  },
  runCommandSchema,
);
export const listRunCommands = procedure(runKey, page(runCommandSchema));
export const listRunArtifacts = procedure(runKey, page(runArtifactSchema));
export const attachRunArtifact = procedure(
  { ...runKey, assetVersionId: z.string(), name: z.string().trim().min(1) },
  runArtifactSchema,
);
export const registerDevice = procedure(
  {
    idempotencyKey: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(120),
    platform: z.string().min(1).max(40),
  },
  z.object({ device: deviceSchema, credential: z.string() }),
);
export const listDevices = procedure({}, page(deviceSchema));
export const revokeDevice = procedure({ deviceId: z.string() }, deviceSchema);
export const bindDeviceProject = procedure(
  {
    deviceId: z.string(),
    projectId: z.string(),
    localBindingId: z.string().min(1),
    tools: z.array(z.string()).max(32).default([]),
    model: z.object({ provider: z.string(), id: z.string() }).nullable().default(null),
    enabled: z.boolean().default(true),
  },
  deviceBindingSchema,
);
export const listDeviceBindings = procedure({ deviceId: z.string() }, page(deviceBindingSchema));
export const heartbeatRunner = procedure({}, deviceSchema);
export const claimRunnerWork = procedure(
  {},
  z.object({ run: agentRunV2Schema, binding: deviceBindingSchema, claimId: z.string() }).nullable(),
);
export const acknowledgeRunnerWork = procedure(deviceRunKey, agentRunV2Schema);
export const appendRunnerEvents = procedure(
  { ...deviceRunKey, events: z.array(runEventSchema).min(1).max(100) },
  z.object({ acknowledgedSeq: z.number().int().nonnegative() }),
);
export const listRunnerCommands = procedure(deviceRunKey, page(runCommandSchema));
export const acknowledgeRunnerCommand = procedure(
  {
    ...deviceRunKey,
    commandId: z.string(),
    outcome: z.enum(["applied", "rejected"]),
    error: z.string().optional(),
  },
  runCommandSchema,
);
export type DeviceDto = z.infer<typeof deviceSchema>;
export type DeviceBindingDto = z.infer<typeof deviceBindingSchema>;
export type AgentRunDto = z.infer<typeof agentRunV2Schema>;
export type RunEventDto = z.infer<typeof runEventSchema>;
export type RunCommandDto = z.infer<typeof runCommandSchema>;
export type RunArtifactDto = z.infer<typeof runArtifactSchema>;
export type RunSnapshotDto = z.infer<typeof runSnapshotSchema>;

export const uploadRunnerArtifact = procedure(
  {
    ...deviceRunKey,
    name: z.string().trim().min(1),
    bodyBase64: z.string().max(14_000_000),
    contentType: z.string().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    idempotencyKey: z.string().min(1).max(200),
  },
  runArtifactSchema,
);
