import { oc } from "@orpc/contract";
import { z } from "zod";
import { memberNotificationsSchema, notificationKeySchema } from "@raypx/core/notifications";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
export const notificationsContract = {
  list: session.input(z.strictObject({})).output(memberNotificationsSchema),
  read: session.input(notificationKeySchema).output(z.strictObject({ ok: z.literal(true) })),
  viewed: session
    .input(z.strictObject({ spaceId: spaceIdSchema, conversationId: conversationIdSchema }))
    .output(z.strictObject({ ok: z.literal(true) })),
};
