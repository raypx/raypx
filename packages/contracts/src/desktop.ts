import { desktopLoginAuthorizationSchema, desktopLoginStartSchema } from "./desktop-login.js";
import { z } from "zod";
import { localEventSchema } from "./local.js";
import { localResults } from "./client.js";
import { conversationClientFrameSchema, conversationServerFrameSchema } from "./conversation.js";

export const desktopExecutionSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["terminal", "tool"]),
  status: z.enum(["running", "finished"]),
  cwd: z.string(),
});
/** Queries are implicitly scoped to the authenticated native owner and origin. */
export const desktopExecutionRequests = {
  execution_list: z.strictObject({}),
  execution_result: z.strictObject({ id: z.uuid() }),
  terminal_restore: z.strictObject({ id: z.uuid() }),
};
export const desktopExecutionResults = {
  execution_list: z.array(desktopExecutionSchema),
  execution_result: localResults["tools.run"],
  terminal_restore: z.object({ accepted: z.literal(true) }),
};
export type DesktopExecution = z.infer<typeof desktopExecutionSchema>;

/** Selected-origin HTTP transport. Cookie and administrative headers are never caller inputs. */
export const desktopApiRequestSchema = z.strictObject({
  id: z.uuid().optional(),
  path: z.string().min(1).max(16384),
  method: z.enum(["GET", "POST"]),
  headers: z.record(z.string().max(128), z.string().max(1024)),
  body: z
    .string()
    .max(256 * 1024)
    .optional(),
});
export const desktopApiResponseSchema = z.strictObject({
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});
export type DesktopApiRequest = z.infer<typeof desktopApiRequestSchema>;
export type DesktopApiResponse = z.infer<typeof desktopApiResponseSchema>;

/** One short-lived capability for the separate renderer listener; contains no admin token. */
export const desktopChannelSchema = z.strictObject({
  protocol: z.literal(1),
  url: z
    .string()
    .url()
    .regex(/^ws:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/desktop$/),
  capability: z.string().min(64).max(200),
  expiresAt: z.iso.datetime(),
});
export type DesktopChannel = z.infer<typeof desktopChannelSchema>;

export const desktopClientFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("authenticate"),
    protocol: z.literal(1),
    capability: z.string().min(64).max(200),
  }),
  z.strictObject({
    type: z.literal("request"),
    id: z.uuid(),
    method: z.string().min(1).max(128),
    params: z.unknown(),
  }),
  z.strictObject({ type: z.literal("cancel"), id: z.uuid() }),
  z.strictObject({
    type: z.literal("ack"),
    streamId: z.uuid(),
    sequence: z.number().int().positive(),
  }),
]);
export type DesktopClientFrame = z.infer<typeof desktopClientFrameSchema>;

export const desktopServerFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready"), protocol: z.literal(1), streamId: z.uuid() }),
  z.strictObject({
    type: z.literal("response"),
    id: z.uuid(),
    result: z.unknown().optional(),
    error: z
      .strictObject({
        code: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/),
        message: z.string().max(128),
      })
      .optional(),
  }),
  z.strictObject({
    type: z.literal("event"),
    streamId: z.uuid(),
    sequence: z.number().int().positive(),
    event: localEventSchema,
  }),
]);

const desktopLoginAttempt = z.strictObject({ id: z.uuid() });
export const desktopLoginRequests = {
  browser_login_start: desktopLoginAttempt.extend({
    webOrigin: desktopLoginStartSchema.shape.webOrigin,
    reauthorizeHost: desktopLoginStartSchema.shape.reauthorizeHost,
  }),
  browser_login_wait: desktopLoginAttempt,
  browser_login_cancel: desktopLoginAttempt,
};
export const desktopLoginResults = {
  browser_login_start: desktopLoginAuthorizationSchema,
  browser_login_wait: z.literal(true),
  browser_login_cancel: z.literal(true),
};

/** Selected-origin conversation stream; session headers stay in the daemon. */
const desktopEventsIdentity = z.strictObject({ id: z.uuid() });
/** Terminal read result, separate from backend conversation/Space frames. */
export const desktopEventsCloseSchema = z.strictObject({
  type: z.literal("closed"),
  code: z.number().int().min(1000).max(4999),
  reason: z.string().max(123),
});
export type DesktopEventsClose = z.infer<typeof desktopEventsCloseSchema>;
export const desktopEventsRequests = {
  events_open: desktopEventsIdentity.extend({ accountId: z.string().min(1).max(128) }),
  events_read: desktopEventsIdentity,
  events_send: desktopEventsIdentity.extend({ frame: conversationClientFrameSchema }),
  events_close: desktopEventsIdentity,
};
export const desktopEventsResults = {
  events_open: z.literal(true),
  events_read: z.union([conversationServerFrameSchema, desktopEventsCloseSchema]).nullable(),
  events_send: z.literal(true),
  events_close: z.literal(true),
};
export type DesktopEventsRead = z.infer<typeof desktopEventsResults.events_read>;
