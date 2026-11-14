import { protectedHeaderSchema } from "./protected-input.js";
import { z } from "zod";
import { agentIdSchema } from "./agents.js";
import { modelConnectionAvailabilitySchema } from "./model-connections.js";
import { spaceIdSchema } from "./spaces.js";

export const mcpServerIdSchema = z.string().uuid();
const httpConfiguration = z.strictObject({
  name: z.string().trim().min(1).max(120),
  transport: z.enum(["http", "stdio"]).default("http"),
  url: z.string().min(1).max(2048),
  perCallSecretHeader: protectedHeaderSchema.nullable().optional(),
  availability: modelConnectionAvailabilitySchema.default({ mode: "all" }),
});
// Recognize and refuse command configurations by transport before considering any
// executable fields. They are discarded and can never become a domain record.
export const mcpServerConfigurationSchema = z.union([
  z
    .object({ transport: z.literal("stdio") })
    .passthrough()
    .transform(() => ({
      name: "Unsupported transport",
      transport: "stdio" as const,
      url: "stdio:unsupported",
      perCallSecretHeader: null,
      availability: { mode: "all" as const },
    })),
  httpConfiguration,
]);
export const mcpCredentialHeadersSchema = z
  .record(z.string().min(1).max(128), z.string().max(8192))
  .refine(
    (headers) => Object.keys(headers).length <= 16 && JSON.stringify(headers).length <= 16384,
  );
export const mcpServerSchema = z.strictObject({
  id: mcpServerIdSchema,
  name: z.string().min(1).max(120),
  transport: z.literal("http"),
  url: z.string().url().max(2048),
  perCallSecretHeader: protectedHeaderSchema.nullable().optional(),
  availability: modelConnectionAvailabilitySchema,
  hasCredentials: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const mcpTestCodeSchema = z.enum([
  "SUCCEEDED",
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "TIMED_OUT",
  "REQUEST_FAILED",
  "INVALID_ENDPOINT",
  "MCP_STDIO_UNSUPPORTED",
  "TOOL_LIMIT",
]);
export const agentMcpSelectionSchema = z.strictObject({
  spaceId: spaceIdSchema,
  agentId: agentIdSchema,
  serverIds: z
    .array(mcpServerIdSchema)
    .max(32)
    .refine((ids) => new Set(ids).size === ids.length),
});
export type McpServer = z.infer<typeof mcpServerSchema>;
export type McpServerConfiguration = z.infer<typeof mcpServerConfigurationSchema>;
export type McpCredentialHeaders = z.infer<typeof mcpCredentialHeadersSchema>;
export type McpTestCode = z.infer<typeof mcpTestCodeSchema>;
