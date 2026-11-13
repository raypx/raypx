import { z } from "zod";
import { terminalProviderSchema, taskModeSchema, taskContextSelectionSchema } from "./tasks.js";

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
  z.strictObject({
    type: z.literal("agent.run"),
    prompt: z.string().trim().min(1).max(32_000),
  }),
]);
export const githubJobEvents = ["push", "issues", "pull_request"] as const;
export const fileJobIntervals = [5, 15, 30, 60, 360, 1440] as const;
const jobTriggersSchema = z.strictObject({
  webhook: z.literal(true).optional(),
  email: z
    .strictObject({
      sender: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    })
    .optional(),
  github: z
    .strictObject({
      repository: z
        .string()
        .trim()
        .toLowerCase()
        .max(200)
        .regex(/^[a-z0-9-]+\/[a-z0-9_.-]+$/),
      events: z
        .array(z.enum(githubJobEvents))
        .min(1)
        .max(githubJobEvents.length)
        .refine((events) => new Set(events).size === events.length),
    })
    .optional(),
  files: z
    .strictObject({
      path: z
        .string()
        .trim()
        .max(1024)
        .transform((value) => value.replaceAll("\\", "/"))
        .refine(
          (value) =>
            !value.startsWith("/") &&
            !value.includes(":") &&
            !value.includes("\0") &&
            !value.split("/").includes(".."),
          "Use a project-relative path",
        )
        .transform((value) =>
          value
            .split("/")
            .filter((part) => part && part !== ".")
            .join("/"),
        ),
      intervalMinutes: z.literal(fileJobIntervals),
    })
    .optional(),
});
export const jobInputSchema = z
  .object({
    projectId: z.uuid().optional(),
    name: z.string().min(1).max(120),
    cron: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
    triggers: jobTriggersSchema.optional(),
    enabled: z.boolean().default(true),
    action: jobActionSchema,
  })
  .superRefine((job, ctx) => {
    const additional = Boolean(job.triggers && Object.values(job.triggers).some(Boolean));
    if (job.action.type === "agent.run" && !job.projectId)
      ctx.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "A Pi automation requires a project",
      });
    if (additional && job.action.type !== "agent.run")
      ctx.addIssue({
        code: "custom",
        path: ["triggers"],
        message: "Additional triggers require Pi",
      });
    if (job.triggers?.files && job.cron)
      ctx.addIssue({
        code: "custom",
        path: ["cron"],
        message: "File changes and Cron cannot be combined",
      });
    if (Boolean(job.cron) !== Boolean(job.timezone) || (!job.cron && !additional))
      ctx.addIssue({
        code: "custom",
        path: ["cron"],
        message: "Choose at least one complete trigger",
      });
  });
export const jobDefinitionSchema = jobInputSchema.safeExtend({
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
  scheduledFor: z.iso.datetime().optional(),
  trigger: z.enum(["webhook", "email", "github", "files"]).optional(),
  session: z.object({ taskId: z.uuid(), projectId: z.uuid(), deviceId: z.uuid() }).optional(),
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
    provider: terminalProviderSchema,
    mode: taskModeSchema,
    prompt: z.string().trim().min(1).max(32_000),
    contextSelection: taskContextSelectionSchema
      .refine(({ sources }) => sources.every((source) => source.attachment === undefined))
      .optional(),
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

export { JobError, nextJobRuns, type JobSchedule } from "./jobs/schedule.js";
