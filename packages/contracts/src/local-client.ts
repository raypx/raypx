import { z } from "zod";
import {
  localParams,
  fileEntrySchema,
  rootGrantSchema,
  type LocalParams,
  type LocalMethod,
} from "./local.js";
import { deviceSchema, deviceProjectSchema } from "./tasks.js";
import {
  taskSchema,
  capabilitySchema,
  agentEventSchema,
  humanRequestSchema,
  taskActivitySchema,
  taskContextSnapshotSchema,
} from "@raypx/core/tasks";
import { observedProjectionSchema, terminalRequestSchema } from "./terminal.js";
import {
  contextDocumentSchema,
  contextDocumentSummarySchema,
  contextVersionSchema,
  contextDeleteResultSchema,
} from "@raypx/memory";
import { jobDefinitionSchema, jobRunSchema } from "@raypx/jobs";

const settings = localParams["approvals.local.configure"];
const connector = z.object({
  provider: z.enum(["claude", "codex"]),
  installed: z.boolean(),
  modified: z.boolean(),
  requiresTrust: z.boolean(),
  error: z.string().nullable(),
  hookInstalled: z.boolean().optional(),
  updateAvailable: z.boolean().optional(),
  settingsFile: z.string().optional(),
  repairable: z.boolean().optional(),
});
const connectorAction = z
  .object({
    provider: z.enum(["claude", "codex"]),
    requiresTrust: z.boolean(),
    preservedModified: z.boolean(),
  })
  .passthrough();
const fileContent = z.object({ text: z.string(), version: z.string() });
const acknowledged = z.object({ accepted: z.boolean() });
const cancelled = z.object({ cancelled: z.boolean() });

/** Methods used by the renderer, with replies owned by the local protocol rather than callers. */
export const localResults = {
  "memory.list": z.array(contextDocumentSummarySchema),
  "memory.get": contextDocumentSchema,
  "memory.create": contextDocumentSchema,
  "memory.update": contextDocumentSchema,
  "memory.archive": contextDocumentSchema,
  "memory.delete": contextDeleteResultSchema,
  "memory.history": z.array(contextVersionSchema),
  "memory.restore": contextDocumentSchema,
  "memory.resolve": taskContextSnapshotSchema,
  "roots.list": z.array(rootGrantSchema),
  "roots.remove": z.object({ removed: z.literal(true) }),
  "files.list": z.object({
    entries: z.array(fileEntrySchema),
    total: z.number(),
    offset: z.number(),
  }),
  "files.stat": fileEntrySchema,
  "files.read": fileContent,
  "files.write": fileContent,
  "files.mkdir": fileEntrySchema,
  "files.move": fileEntrySchema,
  "files.delete": z.object({ deleted: z.literal(true) }),
  "jobs.list": z.array(jobDefinitionSchema),
  "jobs.create": jobDefinitionSchema,
  "jobs.update": jobDefinitionSchema,
  "jobs.delete": z.object({ deleted: z.literal(true) }),
  "jobs.run": jobRunSchema,
  "jobs.history": z.array(jobRunSchema),
  "tools.run": z.object({
    id: z.string(),
    exitCode: z.number(),
    output: z.string(),
    cancelled: z.boolean(),
  }),
  "tools.cancel": cancelled,
  "terminal.open": z.object({ id: z.string() }),
  "terminal.input": acknowledged,
  "terminal.paste": acknowledged,
  "terminal.key": acknowledged,
  "terminal.mouse": acknowledged,
  "terminal.scroll": acknowledged,
  "terminal.resize": acknowledged,
  "terminal.close": cancelled,
  "agents.projects": z.array(deviceProjectSchema),
  "agents.capabilities": z.array(capabilitySchema),
  "agents.configure": z.object({ configured: z.literal(true) }),
  "agents.local.device": deviceSchema,
  "agents.local.list": z.array(taskSchema),
  "agents.local.get": z.object({
    task: taskSchema,
    events: z.array(z.object({ cursor: z.number(), event: agentEventSchema })),
    requests: z.array(humanRequestSchema),
    activity: z.array(taskActivitySchema).optional(),
    activityBefore: z.number().optional(),
  }),
  "agents.local.approvals": z.array(humanRequestSchema),
  "agents.local.execute": z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value: z.unknown() }),
    z.object({ ok: z.literal(false), code: z.string() }),
  ]),
  "agents.local.clear": z.object({ removed: z.number() }),
  "agents.local.detach": z.object({ detached: z.literal(true) }),
  "approvals.local.settings": settings,
  "approvals.local.configure": settings,
  "approvals.local.list": observedProjectionSchema,
  "approvals.local.get": terminalRequestSchema,
  "approvals.local.decide": terminalRequestSchema,
  "connectors.status": z.array(connector),
  "connectors.install": connectorAction,
  "connectors.uninstall": connectorAction,
} as const satisfies Partial<Record<LocalMethod, z.ZodType>>;
export type LocalClientMethod = keyof typeof localResults;
export type LocalResult<M extends LocalClientMethod> = z.output<(typeof localResults)[M]>;
export type LocalTransport = (method: LocalClientMethod, params: unknown) => Promise<unknown>;
export type LocalClient = <M extends LocalClientMethod>(
  method: M,
  params: LocalParams<NoInfer<M>>,
) => Promise<LocalResult<M>>;

export function createLocalClient(transport: LocalTransport): LocalClient {
  return async <M extends LocalClientMethod>(
    method: M,
    params: LocalParams<NoInfer<M>>,
  ): Promise<LocalResult<M>> => {
    const validated = localParams[method].parse(params);
    const value = await transport(method, validated);
    // Indexing a schema map loses the method/reply correlation inside the implementation.
    return localResults[method].parse(value) as LocalResult<M>;
  };
}
