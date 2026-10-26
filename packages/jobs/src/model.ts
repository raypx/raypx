import { z } from "zod";
import { agentProviderSchema, taskModeSchema, taskContextSelectionSchema } from "@raypx/core/tasks";

// These local schemas preserve the established CLI/Desktop wire format.
export const commandSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(86_400_000).default(600_000),
});
export type CommandSpec = z.infer<typeof commandSchema>;
export const jobActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("directory.scan"),
    rootId: z.string().min(1),
    path: z.string().default(""),
  }),
  z.object({ type: z.literal("command.run"), command: commandSchema }),
]);
export const jobInputSchema = z.object({
  name: z.string().min(1).max(120),
  cron: z.string().min(1),
  timezone: z.string().min(1),
  enabled: z.boolean().default(true),
  action: jobActionSchema,
});
export const jobDefinitionSchema = jobInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextRuns: z.array(z.string()).default([]),
});
export const jobRunSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "success", "failed", "cancelled", "interrupted", "skipped"]),
  output: z.string(),
  exitCode: z.number().nullable(),
});
export type JobInput = z.infer<typeof jobInputSchema>;
export type JobDefinition = z.infer<typeof jobDefinitionSchema>;
export type JobRun = z.infer<typeof jobRunSchema>;

const target = { deviceId: z.uuid(), epoch: z.number().int().positive() };
export const cloudJobActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("device.sync"), ...target }),
  z.strictObject({
    type: z.literal("agent.run"),
    ...target,
    projectId: z.uuid(),
    provider: agentProviderSchema,
    mode: taskModeSchema,
    prompt: z.string().trim().min(1).max(32_000),
    contextSelection: taskContextSelectionSchema.optional(),
  }),
]);
export const cloudJobInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  cron: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
  action: cloudJobActionSchema,
});
export const cloudJobSchema = cloudJobInputSchema.extend({
  id: z.uuid(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextRunAt: z.string().nullable(),
});
export const cloudJobCreateSchema = cloudJobInputSchema.extend({ requestId: z.uuid() });
export const cloudJobRunStatusSchema = z.enum([
  "dispatching",
  "running",
  "waiting",
  "unknown",
  "success",
  "failed",
  "cancelled",
  "interrupted",
  "skipped",
]);
export const cloudJobSyncSchema = z.object({
  streamId: z.string(),
  sequence: z.number().int().nonnegative(),
});
export const cloudJobRunSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  jobRevision: z.number().int().positive(),
  trigger: z.enum(["schedule", "manual"]),
  scheduledFor: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: cloudJobRunStatusSchema,
  action: cloudJobActionSchema,
  taskId: z.uuid().nullable(),
  code: z.string().max(120).nullable(),
  sync: cloudJobSyncSchema.nullable(),
});
export const activeCloudJobRunStatuses = ["dispatching", "running", "waiting", "unknown"] as const;
export type CloudJobAction = z.infer<typeof cloudJobActionSchema>;
export type CloudJobInput = z.infer<typeof cloudJobInputSchema>;
export type CloudJobCreateInput = z.infer<typeof cloudJobCreateSchema>;
export type CloudJob = z.infer<typeof cloudJobSchema>;
export type CloudJobRun = z.infer<typeof cloudJobRunSchema>;
export type CloudJobRunStatus = z.infer<typeof cloudJobRunStatusSchema>;
