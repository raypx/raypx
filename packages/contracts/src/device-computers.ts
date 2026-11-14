import { oc } from "@orpc/contract";
import { z } from "zod";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import {
  deviceComputerSchema,
  deviceComputerIdSchema,
  deviceComputerSelectionSchema,
} from "@raypx/core/computers";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const space = z.strictObject({ spaceId: spaceIdSchema });
const device = space.extend({ deviceId: deviceComputerIdSchema });
const conversation = space.extend({ conversationId: conversationIdSchema });
const selected = z.strictObject({ selection: deviceComputerSelectionSchema.nullable() });
const ok = z.strictObject({ ok: z.literal(true) });
export const deviceComputersContract = {
  list: session
    .input(space)
    .output(z.strictObject({ devices: z.array(deviceComputerSchema).max(100) })),
  createPairing: session
    .input(space)
    .output(z.strictObject({ code: z.string().min(8).max(32), expiresAt: z.iso.datetime() })),
  requestGrant: session.input(device).output(z.strictObject({ requestId: z.string().uuid() })),
  revokeGrant: session.input(device.extend({ grantId: z.string().uuid() })).output(ok),
  revoke: session.input(device).output(ok),
  getSelection: session.input(conversation).output(selected),
  select: session
    .input(conversation.extend({ selection: deviceComputerSelectionSchema.nullable() }))
    .output(selected),
};
