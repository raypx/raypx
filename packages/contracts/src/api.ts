import { collectApiExposure, exposeApiTo } from "./api-exposure.js";
import { administrationContract } from "./administration.js";
import { sessionAttachmentContract } from "./attachments.js";
export * from "./administration.js";
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
export * from "./configuration.js";
import { configurationContract } from "./configuration.js";
import { jobsContract } from "./jobs.js";
export * from "./jobs.js";
import { memoryContract } from "./memory.js";
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
  admin: administrationContract,
  attachments: sessionAttachmentContract,
  instances: instancesContract,
  memory: memoryContract,
  jobs: jobsContract,
  hosts: {
    authorize: oc
      .meta(exposeApiTo("native"))
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int().positive() }))
      .output(hostAuthorizationSchema),
    grant: oc
      .meta(exposeApiTo("host"))
      .input(z.object({ credential: z.string().min(64).max(200) }))
      .output(z.object({ accountId: z.string(), grant: deviceGrantSchema })),
    revoke: oc
      .meta(exposeApiTo("native"))
      .input(z.object({ credential: z.string().min(64).max(200) }))
      .output(z.object({ revoked: z.literal(true) })),
  },
  observed: {
    list: httpRead("/observed-requests", "observed", "List observed terminal requests and sessions")
      .meta(exposeApiTo("renderer"))
      .input(z.object({}))
      .output(observedProjectionSchema),
    get: httpRead("/observed-requests/{id}", "observed", "Read an observed terminal request")
      .meta(exposeApiTo("renderer"))
      .input(z.object({ id: z.string().uuid() }))
      .output(terminalRequestSchema),
  },
  configuration: configurationContract,
  devices: {
    register: oc
      .meta(exposeApiTo("renderer"))
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
      .meta(exposeApiTo("renderer"))
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int() }))
      .output(deviceGrantSchema),
    list: httpRead("/devices", "devices", "List registered computers")
      .meta(exposeApiTo("renderer"))
      .input(z.object({}))
      .output(z.array(deviceSchema)),
    revoke: oc
      .meta(exposeApiTo("renderer"))
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int() }))
      .output(z.object({ revoked: z.literal(true) })),
  },
  tasks: {
    list: httpRead("/tasks", "tasks", "List remote tasks")
      .meta(exposeApiTo("renderer"))
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
      .meta(exposeApiTo("renderer"))
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
    list: httpRead("/approvals", "approvals", "List pending approvals")
      .meta(exposeApiTo("renderer"))
      .input(z.object({}))
      .output(z.array(humanRequestSchema)),
  },
  relay: {
    ticket: oc
      .meta(exposeApiTo("renderer"))
      .input(z.object({}))
      .output(z.object({ token: z.string(), expiresAt: z.string() })),
  },
  account: {
    get: httpRead("/account", "account", "Read the signed-in account")
      .meta(exposeApiTo("renderer"))
      .input(z.object({}))
      .output(accountProfileSchema),
    access: httpRead("/account/access", "account", "Read current account permissions", "optional")
      .meta(exposeApiTo("renderer"))
      .input(z.strictObject({}))
      .output(accountAccessSchema),
  },
};

export const apiExposure = collectApiExposure(apiContract);
