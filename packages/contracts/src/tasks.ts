import { z } from "zod";
import { agentProviderSchema, questionSchema, decisionSchema } from "./human.js";
export { agentProviderSchema, questionSchema, decisionSchema } from "./human.js";
export { taskActivityPage, applyActivityEvent } from "./activity.js";
export { taskText, normalizeTaskJson } from "./task-text.js";

export const RELAY_VERSION = 2;

export const taskModeSchema = z.enum(["run", "plan"]);
export const taskStatusSchema = z.enum([
  "pending",
  "running",
  "waiting",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "delivery_failed",
]);
export type AgentProvider = z.infer<typeof agentProviderSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const activeTaskStatuses: TaskStatus[] = ["pending", "running", "waiting", "cancelling"];
export const capabilitySchema = z.object({
  provider: agentProviderSchema,
  available: z.boolean(),
  version: z.string().max(120),
  reason: z.enum(["ready", "missing", "unsupported"]).default("ready"),
  inputModes: z
    .array(z.enum(["steer", "queue"]))
    .max(2)
    .optional(),
});
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
export const taskSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  projectId: z.string().uuid(),
  provider: agentProviderSchema,
  mode: taskModeSchema,
  prompt: z.string().min(1).max(32_000),
  status: taskStatusSchema,
  summary: z.string().max(32_000),
  activityIncomplete: z.boolean().optional(),
  parentTaskId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const humanRequestSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  kind: z.enum(["permission", "question", "plan"]),
  title: z.string().max(500),
  body: z.string().max(128_000),
  questions: z.array(questionSchema).max(10),
  expiresAt: z.string(),
  status: z.enum(["pending", "decided", "applied", "expired", "cancelled"]),
  decision: decisionSchema.nullable(),
});
const activityBase = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  order: z.number().int().positive(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const taskInputActivitySchema = activityBase.extend({
  kind: z.literal("input"),
  mode: z.enum(["steer", "queue"]),
  text: z.string().min(1).max(32_000),
  status: z.enum(["queued", "sending", "sent", "failed", "cancelled", "interrupted"]),
  code: z.enum(["INPUT_DELIVERY_FAILED", "TASK_STOPPED", "HOST_RESTARTED"]).optional(),
});
export const taskActivitySchema = z.discriminatedUnion("kind", [
  activityBase.extend({
    kind: z.literal("message"),
    text: z.string().max(32_000),
    status: z.enum(["streaming", "complete", "interrupted"]),
    truncated: z.boolean(),
  }),
  activityBase.extend({
    kind: z.literal("tool"),
    name: z.string().max(120),
    status: z.enum(["running", "succeeded", "failed", "interrupted"]),
  }),
  activityBase.extend({
    kind: z.literal("usage"),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    known: z.boolean().optional(),
  }),
  taskInputActivitySchema,
]);
export type TaskActivity = z.infer<typeof taskActivitySchema>;
export type TaskInput = Extract<TaskActivity, { kind: "input" }>;
export const taskInputSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  mode: z.enum(["steer", "queue"]),
  prompt: z.string().trim().min(1).max(32_000),
});
export const agentEventSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    kind: z.literal("activity_delta"),
    entryId: z.string().uuid(),
    baseRevision: z.number().int().positive(),
    revision: z.number().int().positive(),
    append: z.string().max(32_000),
    updatedAt: z.string(),
    truncated: z.boolean(),
  }),
  z.object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    kind: z.literal("activity"),
    entry: taskActivitySchema,
  }),
  z.object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    kind: z.literal("status"),
    status: taskStatusSchema,
    summary: z.string().max(32_000).default(""),
    task: taskSchema.optional(),
  }),
  z.object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    kind: z.literal("request"),
    request: humanRequestSchema,
  }),
  z.object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    kind: z.literal("resolved"),
    requestId: z.string().uuid(),
  }),
]);
export const taskCreateSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  projectId: z.string().uuid(),
  provider: agentProviderSchema,
  mode: taskModeSchema.default("run"),
  prompt: z.string().trim().min(1).max(32_000),
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
export type AgentCapability = z.infer<typeof capabilitySchema>;
export type DeviceProject = z.infer<typeof deviceProjectSchema>;
export type SyncDevice = z.infer<typeof deviceSchema>;
export type AgentTask = z.infer<typeof taskSchema>;
export type HumanRequest = z.infer<typeof humanRequestSchema>;
export type HumanDecision = z.infer<typeof decisionSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type DeviceCommand = z.infer<typeof deviceCommandSchema>;
export type DeviceGrant = z.infer<typeof deviceGrantSchema>;

export function validDecision(
  request: Pick<HumanRequest, "kind" | "questions">,
  decision: HumanDecision,
) {
  if (!decisionSchema.safeParse(decision).success) return false;
  if (request.kind !== "question") return decision.type !== "answer";
  if (decision.type === "deny") return true;
  return (
    decision.type === "answer" &&
    Object.keys(decision.answers).length === request.questions.length &&
    request.questions.every((question) => {
      const answers = decision.answers[question.id];
      return Boolean(answers?.length && (question.multiSelect || answers.length === 1));
    })
  );
}

export const relayRequestSchema = z.discriminatedUnion("method", [
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
    protocolVersion: z.literal(RELAY_VERSION),
    role: z.enum(["device", "viewer"]),
    token: z.string().min(32).max(200),
    cursors: z.array(relayCursorSchema).max(200).optional(),
  }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("available") }),
  z.object({
    type: z.literal("announce"),
    streamId: z.string().uuid(),
    instanceId: z.string().uuid(),
    projects: z.array(deviceProjectSchema).max(200),
    capabilities: z.array(capabilitySchema).max(2),
  }),
  z.object({
    type: z.literal("snapshot"),
    id: z.string().uuid(),
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
    protocolVersion: z.literal(RELAY_VERSION),
    role: z.enum(["device", "viewer"]),
  }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("resume"),
    streamId: z.string().uuid(),
    sequence: z.number().int().min(0),
    snapshot: z.boolean(),
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
