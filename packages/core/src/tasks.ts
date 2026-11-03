import { z } from "zod";
import { agentProviderSchema, questionSchema, decisionSchema } from "./human.js";
import { taskContextSelectionSchema, taskContextSnapshotSchema } from "./task-context.js";
export {
  taskContextIdSchema,
  taskContextTargetSchema,
  taskContextSelectionSchema,
  taskContextSnapshotSchema,
  taskExecutionPrompt,
  taskExecutionBudget,
  TaskContextError,
  MAX_TASK_EXECUTION_PROMPT,
  type TaskContextTarget,
  type TaskContextSelection,
  type TaskContextSnapshot,
} from "./task-context.js";
export {
  agentProviderSchema,
  terminalProviderSchema,
  type TerminalProvider,
  agentProviders,
  agentProviderMetadata,
  questionSchema,
  decisionSchema,
} from "./human.js";

export const providerDefinitionSchema = z.object({
  version: z.literal(1),
  runtime: z.enum(["process", "sdk"]),
  modes: z
    .array(z.enum(["plan", "run"]))
    .min(1)
    .max(2),
  approvals: z.boolean(),
  modelSelection: z.boolean(),
});
export type ProviderDefinition = z.infer<typeof providerDefinitionSchema>;

export const capabilitySchema = z.object({
  definition: providerDefinitionSchema,
  provider: agentProviderSchema,
  available: z.boolean(),
  version: z.string().max(120),
  reason: z.enum(["ready", "missing", "unsupported", "unconfigured"]),
  inputModes: z.array(z.enum(["steer", "queue"])).max(2),
});
export type AgentCapability = z.infer<typeof capabilitySchema>;

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
export const modelSelectionSchema = z.strictObject({
  provider: z.string().min(1).max(120),
  model: z.string().min(1).max(200),
  connectionId: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ModelSelection = z.infer<typeof modelSelectionSchema>;
export const modelCatalogSchema = z.object({
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      provider: z.string(),
      api: z.string(),
      input: z.array(z.string()),
      reasoning: z.boolean(),
      contextWindow: z.number(),
      maxTokens: z.number(),
      selection: modelSelectionSchema,
      configured: z.boolean(),
      origin: z.string(),
    }),
  ),
  default: modelSelectionSchema.nullable(),
});
export type ModelCatalog = z.infer<typeof modelCatalogSchema>;
export const taskContinuationSchema = z.object({
  revision: z.number().int().nonnegative(),
  model: modelSelectionSchema,
  blocked: z.boolean(),
  pendingEffect: z.object({ id: z.string(), name: z.string() }).optional(),
});
export type TaskContinuation = z.infer<typeof taskContinuationSchema>;
export const taskCreateSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  projectId: z.string().uuid(),
  provider: agentProviderSchema,
  mode: taskModeSchema.default("run"),
  prompt: z.string().trim().min(1).max(32_000),
  contextSelection: taskContextSelectionSchema.optional(),
  model: modelSelectionSchema.optional(),
});

export const taskFollowUpSchema = z.object({
  id: z.string().uuid(),
  parentTaskId: z.string().uuid(),
  model: modelSelectionSchema.optional(),
  contextRevision: z.number().int().nonnegative().optional(),
  contextTransfer: z
    .object({
      revision: z.number().int().nonnegative(),
      connectionId: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
  prompt: z.string().trim().min(1).max(32_000),
});
export const taskCancelSchema = z.object({ id: z.string().uuid() });
export const approvalDecisionInputSchema = z.object({
  id: z.string().uuid(),
  decision: decisionSchema,
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskFollowUp = z.infer<typeof taskFollowUpSchema>;
export type TaskCancel = z.infer<typeof taskCancelSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionInputSchema>;

export const taskSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  projectId: z.string().uuid(),
  provider: agentProviderSchema,
  mode: taskModeSchema,
  prompt: z.string().min(1).max(32_000),
  context: taskContextSnapshotSchema.optional(),
  model: modelSelectionSchema.optional(),
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
export type AgentTask = z.infer<typeof taskSchema>;
export type HumanRequest = z.infer<typeof humanRequestSchema>;
export type HumanDecision = z.infer<typeof decisionSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;

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

/** Task use cases; relay and IPC own their surrounding delivery envelopes. */
export type TaskCommand =
  | { method: "tasks.create"; input: TaskCreate }
  | { method: "tasks.followUp"; input: TaskFollowUp }
  | { method: "tasks.cancel"; input: TaskCancel }
  | { method: "tasks.input"; input: z.infer<typeof taskInputSchema> }
  | { method: "approvals.decide"; input: ApprovalDecisionInput };
