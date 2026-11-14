import { notificationsContract } from "./notifications.js";
import { deviceComputersContract } from "./device-computers.js";
import { messageAttachmentsContract } from "./message-attachments.js";
import { pagesContract } from "./pages.js";
import { skillsContract } from "./skills.js";
import { openApiServersContract } from "./openapi-servers.js";
import { mcpServersContract } from "./mcp-servers.js";
export * from "./desktop-login.js";
import { collectApiExposure, exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
export { getRpcAccess, getRpcAudit } from "./policy.js";
import { administrationContract } from "./admin.js";
export * from "./admin.js";
import { httpRead } from "./http.js";
export { httpApiPrefix } from "./http.js";
import { z } from "zod";
import { accountAccessSchema } from "./access.js";
export * from "./access.js";
export * from "./config.js";
import { configurationContract } from "./config.js";
import { protectedInputsContract } from "./protected-input.js";
import { agentApprovalsContract } from "./approvals.js";
import { routinesContract } from "./routines.js";
import { spaceMemoryContract } from "./space-memory.js";
import { conversationsContract } from "./conversation.js";
export * from "./conversation.js";
import { spacesContract, agentsContract, computersContract } from "./spaces.js";
import { modelConnectionsContract } from "./model-connections.js";

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
  notifications: notificationsContract,
  deviceComputers: deviceComputersContract,
  messageAttachments: messageAttachmentsContract,
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
  configuration: configurationContract,
  protectedInputs: protectedInputsContract,
  approvals: agentApprovalsContract,
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
