import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  agentMcpSelectionSchema,
  mcpCredentialHeadersSchema,
  mcpServerConfigurationSchema,
  mcpServerIdSchema,
  mcpServerSchema,
  mcpTestCodeSchema,
} from "@raypx/core/mcp-servers";
import { modelConnectionAvailabilitySchema } from "@raypx/core/model-connections";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ id: mcpServerIdSchema });
export const mcpServersContract = {
  list: session.input(z.strictObject({})).output(z.array(mcpServerSchema).max(100)),
  create: session
    .input(
      z.strictObject({
        server: mcpServerConfigurationSchema,
        credentialHeaders: mcpCredentialHeadersSchema.optional(),
      }),
    )
    .output(mcpServerSchema),
  update: session
    .input(
      selection.extend({
        server: mcpServerConfigurationSchema,
        credentialHeaders: mcpCredentialHeadersSchema.optional(),
      }),
    )
    .output(mcpServerSchema),
  delete: session.input(selection).output(z.strictObject({ deleted: z.literal(true) })),
  test: session
    .input(selection)
    .output(
      z.strictObject({ code: mcpTestCodeSchema, toolNames: z.array(z.string().max(64)).max(128) }),
    ),
  setAvailability: session
    .input(selection.extend({ availability: modelConnectionAvailabilitySchema }))
    .output(mcpServerSchema),
  enabled: session
    .input(agentMcpSelectionSchema.omit({ serverIds: true }))
    .output(z.array(mcpServerIdSchema).max(32)),
  setEnabled: session.input(agentMcpSelectionSchema).output(z.array(mcpServerIdSchema).max(32)),
};
