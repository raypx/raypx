import { z } from "zod";
import {
  agentProviderSchema,
  capabilitySchema,
  decisionSchema,
  taskModeSchema,
  taskSchema,
  humanRequestSchema,
  taskActivitySchema,
  taskInputSchema,
  agentEventSchema,
  taskContextSelectionSchema,
  taskContextSnapshotSchema,
} from "@raypx/core/tasks";
import {
  terminalDecisionSchema,
  terminalRequestSchema,
  terminalSessionSchema,
} from "./terminal.js";
export {
  agentProviderSchema,
  capabilitySchema,
  questionSchema,
  decisionSchema,
  taskModeSchema,
  taskStatusSchema,
  activeTaskStatuses,
  taskSchema,
  humanRequestSchema,
  taskInputActivitySchema,
  taskActivitySchema,
  taskInputSchema,
  agentEventSchema,
  validDecision,
  taskContextSelectionSchema,
  taskContextSnapshotSchema,
  taskExecutionPrompt,
  TaskContextError,
  taskContextTargetSchema,
  MAX_TASK_EXECUTION_PROMPT,
  type TaskContextTarget,
  type TaskContextSelection,
  type TaskContextSnapshot,
  type AgentProvider,
  type AgentCapability,
  type TaskStatus,
  type AgentTask,
  type HumanRequest,
  type HumanDecision,
  type TaskActivity,
  type TaskInput,
  type AgentEvent,
} from "@raypx/core/tasks";
export { taskText, normalizeTaskJson } from "@raypx/core/task-text";
export { taskActivityPage, applyActivityEvent } from "@raypx/core/activity";
export const RELAY_VERSION = 3;

export const deviceProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  providers: z.array(agentProviderSchema).max(2),
  dirty: z.boolean(),
});
export const deviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  platform: z.string().max(30),
  appVersion: z.string().max(120),
  epoch: z.number().int(),
  revoked: z.boolean(),
  lastSeenAt: z.string().nullable(),
  online: z.boolean(),
  projects: z.array(deviceProjectSchema),
  capabilities: z.array(capabilitySchema),
});
export const taskCreateSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  projectId: z.string().uuid(),
  provider: agentProviderSchema,
  mode: taskModeSchema.default("run"),
  prompt: z.string().trim().min(1).max(32_000),
  contextSelection: taskContextSelectionSchema.optional(),
});
export const deviceCommandSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal("start"),
    task: taskSchema,
    deadline: z.string(),
  }),
  z.object({ id: z.string().uuid(), type: z.literal("cancel"), taskId: z.string().uuid() }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("decision"),
    taskId: z.string().uuid(),
    requestId: z.string().uuid(),
    decision: decisionSchema,
  }),
]);
export const deviceGrantSchema = z.object({
  deviceId: z.string().uuid(),
  epoch: z.number().int(),
  token: z.string(),
  expiresAt: z.string(),
});
export type DeviceProject = z.infer<typeof deviceProjectSchema>;
export type SyncDevice = z.infer<typeof deviceSchema>;
export type DeviceCommand = z.infer<typeof deviceCommandSchema>;
export type DeviceGrant = z.infer<typeof deviceGrantSchema>;

export const relayRequestSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("observed.decide"), input: terminalDecisionSchema }),
  z.object({ method: z.literal("tasks.input"), input: taskInputSchema }),
  z.object({ method: z.literal("tasks.create"), input: taskCreateSchema }),
  z.object({
    method: z.literal("tasks.followUp"),
    input: z.object({
      id: z.string().uuid(),
      parentTaskId: z.string().uuid(),
      prompt: z.string().trim().min(1).max(32_000),
    }),
  }),
  z.object({ method: z.literal("tasks.cancel"), input: z.object({ id: z.string().uuid() }) }),
  z.object({
    method: z.literal("approvals.decide"),
    input: z.object({ id: z.string().uuid(), decision: decisionSchema }),
  }),
]);
export const relayCommandSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  request: relayRequestSchema,
  context: taskContextSnapshotSchema.optional(),
});
export const snapshotRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("activity"), entry: taskActivitySchema }),
  z.object({ kind: z.literal("task"), task: taskSchema }),
  z.object({ kind: z.literal("request"), request: humanRequestSchema }),
]);
export const sequencedEventSchema = z.object({
  sequence: z.number().int().positive(),
  event: agentEventSchema,
});
export const relayCursorSchema = z.object({
  deviceId: z.string().uuid(),
  streamId: z.string().uuid(),
  sequence: z.number().int().min(0),
});
export const relayClientSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    protocolVersion: z.union([z.literal(2), z.literal(RELAY_VERSION)]),
    role: z.enum(["device", "viewer"]),
    token: z.string().min(32).max(200),
    cursors: z.array(relayCursorSchema).max(200).optional(),
  }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("available") }),
  z.object({
    type: z.literal("observed"),
    epoch: z.string().uuid(),
    revision: z.number().int().positive(),
    sessions: z.array(terminalSessionSchema).max(20),
    requests: z.array(terminalRequestSchema).max(5),
  }),
  z.object({
    type: z.literal("announce"),
    streamId: z.string().uuid(),
    instanceId: z.string().uuid(),
    projects: z.array(deviceProjectSchema).max(200),
    capabilities: z.array(capabilitySchema).max(2),
    syncSupported: z.boolean().optional(),
    contextSupported: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("snapshot"),
    id: z.string().uuid(),
    syncId: z.string().uuid().optional(),
    streamId: z.string().uuid(),
    sequence: z.number().int().min(0),
    records: z.array(snapshotRecordSchema).max(10),
    done: z.boolean(),
  }),
  z.object({
    type: z.literal("events"),
    streamId: z.string().uuid(),
    events: z.array(sequencedEventSchema).min(1).max(50),
  }),
  z.object({ type: z.literal("request"), id: z.string().uuid(), request: relayRequestSchema }),
  z.object({
    type: z.literal("result"),
    routeId: z.string().uuid(),
    result: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), value: z.unknown() }),
      z.object({ ok: z.literal(false), code: z.string().max(80) }),
    ]),
  }),
]);
export const relayServerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    protocolVersion: z.union([z.literal(2), z.literal(RELAY_VERSION)]),
    role: z.enum(["device", "viewer"]),
    contextSupported: z.boolean().optional(),
  }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("observed_ack"),
    epoch: z.string().uuid(),
    revision: z.number().int().positive(),
  }),
  z.object({ type: z.literal("observed_changed"), deviceId: z.string().uuid() }),
  z.object({
    type: z.literal("resume"),
    streamId: z.string().uuid(),
    sequence: z.number().int().min(0),
    snapshot: z.boolean(),
    syncId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal("ack"),
    streamId: z.string().uuid(),
    sequence: z.number().int().min(0),
    snapshotId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal("changed"),
    ...relayCursorSchema.shape,
    events: z.array(sequencedEventSchema).max(50).optional(),
    reset: z.boolean().optional(),
  }),
  z.object({ type: z.literal("command"), routeId: z.string().uuid(), command: relayCommandSchema }),
  z.object({
    type: z.literal("result"),
    id: z.string().uuid(),
    result: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), value: z.unknown() }),
      z.object({ ok: z.literal(false), code: z.string().max(80) }),
    ]),
  }),
  z.object({ type: z.literal("error"), code: z.string().max(80) }),
]);
export type RelayRequest = z.infer<typeof relayRequestSchema>;
export type RelayCommand = z.infer<typeof relayCommandSchema>;
export type RelayClientFrame = z.infer<typeof relayClientSchema>;
export type RelayServerFrame = z.infer<typeof relayServerSchema>;
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;
export type SequencedEvent = z.infer<typeof sequencedEventSchema>;
export type RelayCursor = z.infer<typeof relayCursorSchema>;
export const taskChangeSchema = z.object({
  type: z.enum(["reset", "events", "devices"]),
  deviceId: z.string().uuid().optional(),
  local: z.boolean().optional(),
  events: z.array(sequencedEventSchema).max(50).optional(),
});
export type TaskChange = z.infer<typeof taskChangeSchema>;
export const MAX_RELAY_BYTES = 1024 * 1024;
