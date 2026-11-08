import { z } from "zod";
import {
  decisionSchema,
  humanRequestSchema,
  taskActivitySchema,
  taskModeSchema,
  taskSchema,
} from "@raypx/core/tasks";

/**
 * CLI-private orchestration events. They are the durable record of a task's
 * lifecycle; the relay `AgentEvent` journal is a projection of them (`wire.ts`),
 * and the task, request, input and activity tables are a second projection
 * (`projector.ts`). Nothing outside `runtime/agents` consumes these schemas.
 */

const taskEventBase = {
  /** Event identity, also the journal row identity for the events it projects. */
  id: z.string().uuid(),
  binding: z.string().min(1),
  taskId: z.string().uuid(),
  at: z.string(),
};

const taskAcceptedSchema = z.object({
  type: z.literal("task.accepted"),
  ...taskEventBase,
  task: taskSchema,
  sessionId: z.string().nullable(),
  receiptId: z.string().uuid(),
});

const taskStatusChangedSchema = z.object({
  type: z.literal("task.statusChanged"),
  ...taskEventBase,
  task: taskSchema,
  sessionId: z.string().nullable(),
  /** The request and activity statuses an inactive status settles. */
  settledRequests: z.array(humanRequestSchema),
  settledActivity: z.array(taskActivitySchema),
});

const taskSessionBoundSchema = z.object({
  type: z.literal("task.sessionBound"),
  ...taskEventBase,
  task: taskSchema,
  sessionId: z.string().nullable(),
  tokenUsage: z
    .object({
      inputTokens: z.number().nonnegative(),
      outputTokens: z.number().nonnegative(),
      cachedInputTokens: z.number().nonnegative(),
      cacheWriteInputTokens: z.number().nonnegative(),
    })
    .optional(),
});

const taskModeChangedSchema = z.object({
  type: z.literal("task.modeChanged"),
  ...taskEventBase,
  sessionId: z.string().nullable(),
  mode: taskModeSchema,
  task: taskSchema,
});

const taskTokenUsageSchema = z.object({
  type: z.literal("task.tokenUsage"),
  ...taskEventBase,
  task: taskSchema,
  sessionId: z.string().nullable(),
  totals: z.object({
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    cachedInputTokens: z.number().nonnegative(),
    cacheWriteInputTokens: z.number().nonnegative(),
  }),
});

const requestOpenedSchema = z.object({
  type: z.literal("request.opened"),
  ...taskEventBase,
  request: humanRequestSchema,
});

const requestDecidedSchema = z.object({
  type: z.literal("request.decided"),
  ...taskEventBase,
  request: humanRequestSchema,
});

const requestAppliedSchema = z.object({
  type: z.literal("request.applied"),
  ...taskEventBase,
  request: humanRequestSchema,
  decision: decisionSchema,
});

const requestExpiredSchema = z.object({
  type: z.literal("request.expired"),
  ...taskEventBase,
  request: humanRequestSchema,
});

const inputQueuedSchema = z.object({
  type: z.literal("input.queued"),
  ...taskEventBase,
  entry: taskActivitySchema,
});

const inputStatusChangedSchema = z.object({
  type: z.literal("input.statusChanged"),
  ...taskEventBase,
  entry: taskActivitySchema,
});

const activityRecordedSchema = z.object({
  type: z.literal("activity.recorded"),
  ...taskEventBase,
  entry: taskActivitySchema,
  /** Delta shape retained for streaming message updates on relay bindings. */
  delta: z
    .object({
      entryId: z.string().uuid(),
      baseRevision: z.number().int().positive(),
      revision: z.number().int().positive(),
      append: z.string().max(32_000),
      truncated: z.boolean(),
    })
    .optional(),
});

export const orchestrationEventSchema = z.discriminatedUnion("type", [
  taskAcceptedSchema,
  taskStatusChangedSchema,
  taskSessionBoundSchema,
  taskModeChangedSchema,
  taskTokenUsageSchema,
  requestOpenedSchema,
  requestDecidedSchema,
  requestAppliedSchema,
  requestExpiredSchema,
  inputQueuedSchema,
  inputStatusChangedSchema,
  activityRecordedSchema,
]);

export type TaskAccepted = z.infer<typeof taskAcceptedSchema>;
export type TaskStatusChanged = z.infer<typeof taskStatusChangedSchema>;
export type RequestOpened = z.infer<typeof requestOpenedSchema>;
export type ActivityRecorded = z.infer<typeof activityRecordedSchema>;
export type OrchestrationEvent = z.infer<typeof orchestrationEventSchema>;

/** Activity is the latest-value projection only; it never enters `task_events`. */
export const isActivityEvent = (event: OrchestrationEvent) => event.type === "activity.recorded";
