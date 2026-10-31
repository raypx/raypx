import { z } from "zod";
import { deviceCommandSchema, relayCommandSchema, relayRequestSchema } from "./tasks.js";
import {
  taskSchema,
  agentProviderSchema,
  taskContextSelectionSchema,
  taskContextTargetSchema,
} from "@raypx/core/tasks";
import { hostAuthorizationSchema, terminalDecisionSchema } from "./terminal.js";
import {
  contextCreateSchema,
  contextUpdateSchema,
  contextArchiveSchema,
  contextDeleteSchema,
  contextHistorySchema,
  contextRestoreSchema,
} from "@raypx/memory";

export const LOCAL_PROTOCOL_VERSION = 1 as const;
/** Private device-profile owner, independent of any remote account or deployment. */
export const LOCAL_WORKSPACE_ID = "device:local-workspace:v1";
export const MAX_TEXT_BYTES = 1024 * 1024;
const pathRef = { rootId: z.string().min(1), path: z.string().default("") };
const deviceOwner = { accountId: z.literal(LOCAL_WORKSPACE_ID) };
const hostScope = { accountId: z.string().min(1).max(200), apiUrl: z.string().min(1).max(2048) };
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
import { commandSchema, jobInputSchema } from "@raypx/jobs";
export const localParams = {
  "memory.list": z.strictObject({}),
  "memory.get": z.strictObject({ id: z.uuid() }),
  "memory.create": contextCreateSchema,
  "memory.update": contextUpdateSchema,
  "memory.archive": contextArchiveSchema,
  "memory.delete": contextDeleteSchema,
  "memory.history": contextHistorySchema,
  "memory.restore": contextRestoreSchema,
  "memory.resolve": z.strictObject({
    selection: taskContextSelectionSchema,
    target: taskContextTargetSchema,
    prompt: z.string().min(1).max(32_000).optional(),
  }),
  "host.session": z.object({
    accountId: z.string().min(1).max(200).nullable(),
    apiUrl: z.string().max(2048),
  }),
  "host.info": z.object(hostScope),
  "host.refresh": z.object(hostScope),
  "host.enable": z.object({ ...hostScope, enabled: z.boolean() }),
  "host.revoked": z.object(hostScope),
  "host.authorize": z.object({ ...hostScope, authorization: hostAuthorizationSchema }),
  "host.detach": z.object(hostScope),
  "approvals.local.settings": z.strictObject({}),
  "approvals.local.configure": z.strictObject({
    rootIds: z.array(z.uuid()).max(200),
    away: z.boolean(),
    waitSeconds: z.number().int().min(60).max(600),
  }),
  "approvals.local.list": z.strictObject({}),
  "approvals.local.get": z.strictObject({ id: z.uuid() }),
  "approvals.local.decide": z.strictObject({ decision: terminalDecisionSchema }),
  "approvals.local.watch": z.strictObject({ active: z.boolean() }),
  "host.terminal.settings": z.object(hostScope),
  "host.terminal.configure": z.object({
    ...hostScope,
    enabled: z.boolean(),
    rootIds: z.array(z.uuid()).max(200),
  }),
  "observed.remote": z.object({
    binding: z.string().min(1).max(300),
    decision: terminalDecisionSchema,
  }),
  "connectors.status": z.object({
    configDirs: z
      .object({
        claude: z.string().min(1).max(4096).optional(),
        codex: z.string().min(1).max(4096).optional(),
      })
      .optional(),
  }),
  "connectors.install": z.object({
    provider: agentProviderSchema,
    recoverModified: z.boolean().default(false),
    configDirs: z
      .object({
        claude: z.string().min(1).max(4096).optional(),
        codex: z.string().min(1).max(4096).optional(),
      })
      .optional(),
  }),
  "connectors.uninstall": z.object({
    provider: agentProviderSchema,
    configDirs: z
      .object({
        claude: z.string().min(1).max(4096).optional(),
        codex: z.string().min(1).max(4096).optional(),
      })
      .optional(),
  }),
  "agents.local.device": z.object(deviceOwner),
  "agents.local.list": z.object({
    ...deviceOwner,
    limit: z.number().int().min(1).max(100).default(100),
    before: z.string().optional(),
  }),
  "agents.local.get": z.object({
    ...deviceOwner,
    id: z.string().uuid(),
    after: z.number().int().min(0).default(0),
    beforeActivity: z.number().int().positive().optional(),
  }),
  "agents.local.approvals": z.object(deviceOwner),
  "agents.local.execute": z.object({
    ...deviceOwner,
    id: z.string().uuid(),
    request: relayRequestSchema,
  }),
  "agents.local.clear": z.object(deviceOwner),
  "agents.local.detach": z.object(deviceOwner),
  "agents.remote": z.object({ binding: z.string().min(1).max(300), command: relayCommandSchema }),
  "agents.checkpoint": z.object({
    binding: z.string().min(1).max(300),
    sequence: z.number().int().min(0),
  }),
  "agents.replay": z.object({
    binding: z.string().min(1).max(300),
    after: z.number().int().min(0),
  }),
  "agents.snapshot": z.object({
    binding: z.string().min(1).max(300),
    id: z.string().uuid().optional(),
    offset: z.number().int().min(0).default(0),
  }),
  "agents.capabilities": z.object({}),
  "agents.projects": z.object({}),
  "agents.configure": z.object({
    rootId: z.string().uuid(),
    providers: z.array(agentProviderSchema).max(2),
  }),
  "agents.start": z.object({
    binding: z.string().min(1).max(300),
    commandId: z.string().uuid(),
    task: taskSchema,
    deadline: z.string(),
  }),
  "agents.command": z.object({ binding: z.string().min(1).max(300), command: deviceCommandSchema }),
  "agents.events": z.object({ binding: z.string().min(1).max(300) }),
  "agents.ack": z.object({
    binding: z.string().min(1).max(300),
    ids: z.array(z.string().uuid()).max(50),
  }),
  "agents.detach": z.object({ binding: z.string().min(1).max(300) }),
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
  "terminal.paste": z.object({ id: z.string(), text: z.string().max(65536) }),
  "terminal.key": z.object({
    id: z.string(),
    key: z
      .string()
      .min(1)
      .max(48)
      .regex(/^[a-z0-9+]+$/i),
  }),
  "terminal.mouse": z.object({
    id: z.string(),
    action: z.enum(["down", "up", "drag", "move"]),
    button: z.enum(["left", "middle", "right"]),
    column: z.number().int().min(0).max(499),
    row: z.number().int().min(0).max(299),
    modifiers: z.number().int().min(0).max(7),
  }),
  "terminal.scroll": z.object({
    id: z.string(),
    direction: z.enum(["up", "down"]),
    lines: z.number().int().min(1).max(300),
  }),
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
    "agent.changed",
    "sync.grantRequired",
    "observed.changed",
    "approval.open",
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
