import { oc } from "@orpc/contract";
import { z } from "zod";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  routineIdSchema,
  routineInputSchema,
  routineSchema,
  routineDeliveryOutcomeSchema,
  routineHistorySchema,
  routineEventSchema,
} from "@raypx/core/routines";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const space = z.strictObject({ spaceId: spaceIdSchema });
const selected = space.extend({ id: routineIdSchema });
const limit = z.number().int().min(1).max(100).default(50);
const mutation = z.strictObject({
  routine: routineSchema,
  webhookKey: z.string().nullable(),
  repositorySecret: z.string().nullable(),
});
export const routinesContract = {
  list: session
    .input(space.extend({ agentId: agentIdSchema.optional(), limit }))
    .output(z.array(routineSchema).max(100)),
  get: session.input(selected).output(routineSchema),
  create: session.input(space.extend({ routine: routineInputSchema })).output(mutation),
  update: session.input(selected.extend({ routine: routineInputSchema })).output(mutation),
  pause: session.input(selected).output(routineSchema),
  resume: session.input(selected).output(routineSchema),
  delete: session.input(selected).output(z.strictObject({ deleted: z.literal(true) })),
  test: session
    .input(selected.extend({ idempotencyKey: z.string().min(1).max(200) }))
    .output(routineDeliveryOutcomeSchema),
  rotateWebhookKey: session
    .input(selected)
    .output(z.strictObject({ routine: routineSchema, webhookKey: z.string() })),
  history: session.input(selected.extend({ limit })).output(z.array(routineHistorySchema).max(100)),
  events: session.input(selected.extend({ limit })).output(z.array(routineEventSchema).max(100)),
};
