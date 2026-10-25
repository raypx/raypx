import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  deviceSchema,
  deviceGrantSchema,
  taskSchema,
  humanRequestSchema,
  agentEventSchema,
  taskActivitySchema,
} from "./tasks.js";
export * from "./tasks.js";
export * from "./configuration.js";
import { configurationContract } from "./configuration.js";
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
export type AccountProfileDto = AccountProfile;

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
  hosts: {
    authorize: oc
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int().positive() }))
      .output(hostAuthorizationSchema),
    grant: oc
      .input(z.object({ credential: z.string().min(64).max(200) }))
      .output(z.object({ accountId: z.string(), grant: deviceGrantSchema })),
    revoke: oc
      .input(z.object({ credential: z.string().min(64).max(200) }))
      .output(z.object({ revoked: z.literal(true) })),
  },
  observed: {
    list: oc.input(z.object({})).output(observedProjectionSchema),
    get: oc.input(z.object({ id: z.string().uuid() })).output(terminalRequestSchema),
  },
  configuration: configurationContract,
  devices: {
    register: oc
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
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int() }))
      .output(deviceGrantSchema),
    list: oc.input(z.object({})).output(z.array(deviceSchema)),
    revoke: oc
      .input(z.object({ deviceId: z.string().uuid(), epoch: z.number().int() }))
      .output(z.object({ revoked: z.literal(true) })),
  },
  tasks: {
    list: oc
      .input(
        z.object({
          before: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
      )
      .output(z.array(taskSchema)),
    get: oc
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
          activity: z.array(taskActivitySchema).optional(),
          activityBefore: z.number().int().positive().optional(),
        }),
      ),
  },
  approvals: {
    list: oc.input(z.object({})).output(z.array(humanRequestSchema)),
  },
  relay: {
    ticket: oc.input(z.object({})).output(z.object({ token: z.string(), expiresAt: z.string() })),
  },
  account: {
    get: oc.input(z.object({})).output(accountProfileSchema),
  },
};
