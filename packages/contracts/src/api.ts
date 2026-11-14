import { pagesContract } from "./pages.js";
import { skillsContract } from "./skills.js";
import { openApiServersContract } from "./openapi-servers.js";
import { mcpServersContract } from "./mcp-servers.js";
export * from "./desktop-login.js";
import { collectApiExposure, exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
export { getRpcAccess, getRpcAudit } from "./policy.js";
import { administrationContract } from "./admin.js";
import { sessionAttachmentContract } from "./attachments.js";
export * from "./admin.js";
export * from "./attachments.js";
import { instancesContract } from "./instances.js";
import { oc } from "@orpc/contract";
import { httpRead } from "./http.js";
export { httpApiPrefix } from "./http.js";
import { z } from "zod";
import { accountAccessSchema } from "./access.js";
export * from "./access.js";
import { deviceSchema, deviceGrantSchema } from "./tasks.js";
import {
  taskSchema,
  humanRequestSchema,
  agentEventSchema,
  taskActivitySchema,
} from "@raypx/core/tasks";
export * from "./tasks.js";
export * from "./config.js";
import { configurationContract } from "./config.js";
import { agentApprovalsContract } from "./approvals.js";
import { jobsContract } from "./jobs.js";
export * from "./jobs.js";
import { memoryContract } from "./memory.js";
import { routinesContract } from "./routines.js";
import { spaceMemoryContract } from "./space-memory.js";
import { conversationsContract } from "./conversation.js";
export * from "./conversation.js";
import { spacesContract, agentsContract, computersContract } from "./spaces.js";
import { modelConnectionsContract } from "./model-connections.js";
export * from "./memory.js";
import {
  hostAuthorizationSchema,
  observedProjectionSchema,
  terminalRequestSchema,
} from "./terminal.js";
export * from "./terminal.js";

export const accountProfileSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string(),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

export const apiErrorDataSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  }),
  requestId: z.string().min(1),
});
export type ApiErrorData = z.infer<typeof apiErrorDataSchema>;

/** Local execution is deliberately absent from the public HTTP router. */
export const apiContract = {
  pages: pagesContract,
  skills: skillsContract,
  mcpServers: mcpServersContract,
  openApiServers: openApiServersContract,
  routines: routinesContract,
  spaceMemory: spaceMemoryContract,
  modelConnections: modelConnectionsContract,
  computers: computersContract,
  spaces: spacesContract,
  agents: agentsContract,
  conversations: conversationsContract,
  admin: administrationContract,
  attachments: sessionAttachmentContract,
  instances: instancesContract,
  memory: memoryContract,
  jobs: jobsContract,
  hosts: {
    authorize: oc
      .meta(exposeApiTo("native"), rpcAccess("projects.read"))
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int().positive() }))
      .output(hostAuthorizationSchema),
    grant: oc
      .meta(exposeApiTo("host"), rpcAccess("public"))
      .input(z.object({ credential: z.string().min(64).max(200) }))
      .output(z.object({ accountId: z.string(), grant: deviceGrantSchema })),
    revoke: oc
      .meta(exposeApiTo("native"), rpcAccess("public"))
      .input(z.object({ credential: z.string().min(64).max(200) }))
      .output(z.object({ revoked: z.literal(true) })),
  },
  observed: {
    list: httpRead("/observed-requests", "observed", "List observed terminal requests and sessions")
      .meta(exposeApiTo("renderer"), rpcAccess("approvals.read"))
      .input(z.object({}))
      .output(observedProjectionSchema),
    get: httpRead("/observed-requests/{id}", "observed", "Read an observed terminal request")
      .meta(exposeApiTo("renderer"), rpcAccess("approvals.read"))
      .input(z.object({ id: z.string().uuid() }))
      .output(terminalRequestSchema),
  },
  configuration: configurationContract,
  devices: {
    register: oc
      .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
      .input(
        z.object({
          installationId: z.string().uuid(),
          name: z.string().trim().min(1).max(120),
          platform: z.string().max(30),
          appVersion: z.string().max(120),
          reconnect: z.boolean().default(false),
        }),
      )
      .output(deviceGrantSchema),
    refreshGrant: oc
      .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int() }))
      .output(deviceGrantSchema),
    list: httpRead("/devices", "devices", "List registered computers")
      .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
      .input(z.object({}))
      .output(z.array(deviceSchema)),
    revoke: oc
      .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int() }))
      .output(z.object({ revoked: z.literal(true) })),
  },
  tasks: {
    list: httpRead("/tasks", "tasks", "List remote tasks")
      .meta(exposeApiTo("renderer"), rpcAccess("tasks.read"))
      .input(
        z.object({
          before: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(50),
          projectId: z.string().uuid().optional(),
          deviceId: z.string().uuid().optional(),
        }),
      )
      .output(z.array(taskSchema)),
    get: httpRead("/tasks/{id}", "tasks", "Read a task and its activity")
      .meta(exposeApiTo("renderer"), rpcAccess("tasks.read"))
      .input(
        z.object({
          id: z.string().uuid(),
          after: z.number().int().min(0).default(0),
          beforeActivity: z.number().int().positive().optional(),
        }),
      )
      .output(
        z.object({
          task: taskSchema,
          events: z.array(z.object({ cursor: z.number(), event: agentEventSchema })),
          requests: z.array(humanRequestSchema),
          activity: z.array(taskActivitySchema),
          activityBefore: z.number().int().positive().optional(),
        }),
      ),
  },
  approvals: {
    ...agentApprovalsContract,
    list: httpRead("/approvals", "approvals", "List pending approvals")
      .meta(exposeApiTo("renderer"), rpcAccess("approvals.read"))
      .input(z.object({}))
      .output(z.array(humanRequestSchema)),
  },
  relay: {
    ticket: oc
      .meta(exposeApiTo("renderer"), rpcAccess("tasks.read"))
      .input(z.object({}))
      .output(z.object({ token: z.string(), expiresAt: z.string() })),
  },
  account: {
    get: httpRead("/account", "account", "Read the signed-in account")
      .meta(exposeApiTo("renderer"), rpcAccess("session"))
      .input(z.object({}))
      .output(accountProfileSchema),
    access: httpRead("/account/access", "account", "Read current account permissions", "optional")
      .meta(exposeApiTo("renderer"), rpcAccess("public"))
      .input(z.strictObject({}))
      .output(accountAccessSchema),
  },
};

export const apiExposure = collectApiExposure(apiContract);
