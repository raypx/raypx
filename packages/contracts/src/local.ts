import { z } from "zod";

export const LOCAL_PROTOCOL_VERSION = 1 as const;
export const MAX_TEXT_BYTES = 1024 * 1024;
const pathRef = { rootId: z.string().min(1), path: z.string().default("") };
export const rootGrantSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
});
export type RootGrant = z.infer<typeof rootGrantSchema>;
export const fileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(["file", "directory", "symlink", "other"]),
  size: z.number(),
  modifiedAt: z.string(),
  version: z.string(),
});
export type FileEntry = z.infer<typeof fileEntrySchema>;
export const commandSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(86_400_000).default(600_000),
});
export type CommandSpec = z.infer<typeof commandSchema>;
export const jobActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("directory.scan"), ...pathRef }),
  z.object({ type: z.literal("command.run"), command: commandSchema }),
]);
export const jobInputSchema = z.object({
  name: z.string().min(1).max(120),
  cron: z.string().min(1),
  timezone: z.string().min(1),
  enabled: z.boolean().default(true),
  action: jobActionSchema,
});
export type JobInput = z.infer<typeof jobInputSchema>;
export const jobDefinitionSchema = jobInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextRuns: z.array(z.string()).default([]),
});
export type JobDefinition = z.infer<typeof jobDefinitionSchema>;
export const jobRunSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "success", "failed", "cancelled", "interrupted", "skipped"]),
  output: z.string(),
  exitCode: z.number().nullable(),
});
export type JobRun = z.infer<typeof jobRunSchema>;
export const localParams = {
  "runtime.info": z.object({}),
  "roots.list": z.object({}),
  "roots.register": z.object({ path: z.string().min(1) }),
  "roots.remove": z.object({ id: z.string().min(1) }),
  "files.list": z.object({
    ...pathRef,
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(500).default(100),
  }),
  "files.stat": z.object(pathRef),
  "files.read": z.object(pathRef),
  "files.write": z.object({ ...pathRef, text: z.string(), version: z.string().nullable() }),
  "files.mkdir": z.object(pathRef),
  "files.move": z.object({ ...pathRef, to: z.string().min(1), version: z.string() }),
  "files.delete": z.object({ ...pathRef, version: z.string(), confirmed: z.literal(true) }),
  "jobs.list": z.object({}),
  "jobs.create": jobInputSchema,
  "jobs.update": jobInputSchema.extend({ id: z.string() }),
  "jobs.delete": z.object({ id: z.string() }),
  "jobs.run": z.object({ id: z.string() }),
  "jobs.history": z.object({ id: z.string() }),
  "tools.run": commandSchema.extend({ id: z.string().uuid().optional() }),
  "tools.cancel": z.object({ id: z.string() }),
  "terminal.open": commandSchema.extend({
    cols: z.number().int().min(2).max(500).default(80),
    rows: z.number().int().min(2).max(300).default(24),
  }),
  "terminal.input": z.object({ id: z.string(), data: z.string() }),
  "terminal.resize": z.object({
    id: z.string(),
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(300),
  }),
  "terminal.close": z.object({ id: z.string() }),
} as const;
export type LocalMethod = keyof typeof localParams;
export type LocalParams<M extends LocalMethod> = z.input<(typeof localParams)[M]>;
export const localRequestSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(120),
  method: z.enum(Object.keys(localParams) as [LocalMethod, ...LocalMethod[]]),
  params: z.unknown(),
});
export type LocalRequest = z.infer<typeof localRequestSchema>;
export const localEventSchema = z.object({
  version: z.literal(1),
  event: z.enum([
    "terminal.output",
    "terminal.exit",
    "tool.finished",
    "job.finished",
    "engine.status",
  ]),
  data: z.record(z.string(), z.unknown()),
});
export type LocalEvent = z.infer<typeof localEventSchema>;
export const localResponseSchema = z.union([
  z.object({ version: z.literal(1), id: z.string(), result: z.json() }),
  z.object({
    version: z.literal(1),
    id: z.string(),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type LocalResponse = z.infer<typeof localResponseSchema>;
export interface FileListing {
  entries: FileEntry[];
  total: number;
  offset: number;
}
export interface FileContent {
  text: string;
  version: string;
}
export interface ToolResult {
  id: string;
  exitCode: number;
  output: string;
  cancelled: boolean;
}
