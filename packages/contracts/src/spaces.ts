import { spaceComputerSchema } from "@raypx/core/computers";
import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  spaceIdSchema,
  spaceSchema,
  spaceMemberSchema,
  spaceInputSchema,
} from "@raypx/core/spaces";
import {
  agentIdSchema,
  agentInputSchema,
  agentSchema,
  conversationSchema,
} from "@raypx/core/agents";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const membership = z.strictObject({ space: spaceSchema, member: spaceMemberSchema });
const agentConversation = z.strictObject({ agent: agentSchema, conversation: conversationSchema });
// spaceId selects a resource. Only a freshly resolved session/member row grants its scope.
const spaceSelection = z.strictObject({ spaceId: spaceIdSchema });
const agentSelection = spaceSelection.extend({ id: agentIdSchema });

export const spacesContract = {
  list: session.input(z.strictObject({})).output(z.array(membership)),
  create: session.input(spaceInputSchema).output(membership),
};
export const agentsContract = {
  models: session
    .input(spaceSelection)
    .output(
      z.array(
        z.strictObject({ modelId: z.string().min(1).max(200), name: z.string().min(1).max(200) }),
      ),
    ),
  list: session
    .input(spaceSelection.extend({ limit: z.number().int().min(1).max(100).default(50) }))
    .output(z.array(agentConversation).max(100)),
  create: session
    .input(spaceSelection.extend({ agent: agentInputSchema }))
    .output(agentConversation),
  get: session.input(agentSelection).output(agentConversation),
  update: session
    .input(agentSelection.extend({ agent: agentInputSchema }))
    .output(agentConversation),
  delete: session.input(agentSelection).output(z.strictObject({ deleted: z.literal(true) })),
};

export const computersContract = {
  get: session.input(spaceSelection).output(spaceComputerSchema),
  start: session.input(spaceSelection).output(spaceComputerSchema),
  stop: session.input(spaceSelection).output(spaceComputerSchema),
};
