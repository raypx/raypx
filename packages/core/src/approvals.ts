import { z } from "zod";
import { conversationIdSchema } from "./agents.js";
import { runIdSchema } from "./run-identity.js";
import { spaceIdSchema } from "./spaces.js";

export const computerToolNameSchema = z.enum([
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "computer_run_command",
  "computer_screenshot",
  "computer_pointer",
  "computer_keyboard",
  "agent_memory_save",
  "agent_memory_update",
  "agent_page_create",
  "agent_page_update",
  "agent_page_read",
  "agent_skill_load",
  "agent_skill_save",
]);
export type ComputerToolName = z.infer<typeof computerToolNameSchema>;
/** Dynamic remote tools never extend the closed built-in catalog. */
export const mcpToolNameSchema = z
  .string()
  .max(128)
  .regex(/^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$/)
  .brand<"McpToolName">();
export type McpToolName = z.infer<typeof mcpToolNameSchema>;
export const openApiToolNameSchema = z
  .string()
  .max(128)
  .regex(/^openapi_[a-f0-9]{32}__[a-zA-Z0-9_-]{1,64}$/)
  .brand<"OpenApiToolName">();
export const toolNameSchema = z.union([
  computerToolNameSchema,
  mcpToolNameSchema,
  openApiToolNameSchema,
]);
export type ToolName = z.infer<typeof toolNameSchema>;
export const approvalModeSchema = z.enum(["ask", "never"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;
// Accept the explicit choice at the boundary so the service can report unavailability.
export const approvalModeInputSchema = z.enum(["ask", "never", "auto"]);
export const approvalRuleSchema = z
  .strictObject({
    toolName: toolNameSchema,
    executable: z.string().min(1).max(1_024).nullable(),
    decision: z.enum(["allow", "block"]),
  })
  .refine(
    (rule) => (rule.toolName === "computer_run_command") === (rule.executable !== null),
    "Command rules require an exact executable; other tools have no executable",
  );
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;
export const approvalSettingsSchema = z.strictObject({
  mode: approvalModeSchema,
  rules: z.array(approvalRuleSchema).max(256),
});
export type ApprovalSettings = z.infer<typeof approvalSettingsSchema>;
export const revisionedApprovalSettingsSchema = approvalSettingsSchema.extend({
  revision: z.number().int().nonnegative(),
});
export type RevisionedApprovalSettings = z.infer<typeof revisionedApprovalSettingsSchema>;
export const approvalModeAvailabilitySchema = z.discriminatedUnion("available", [
  z.strictObject({
    mode: approvalModeInputSchema,
    available: z.literal(true),
    reasonCode: z.null(),
  }),
  z.strictObject({
    mode: approvalModeInputSchema,
    available: z.literal(false),
    reasonCode: z.enum(["REVIEW_MODEL_NOT_CONFIGURED"]),
  }),
]);
export const approvalSettingsStateSchema = revisionedApprovalSettingsSchema.extend({
  availableModes: z.array(approvalModeAvailabilitySchema).length(3),
});
export type ApprovalSettingsState = z.infer<typeof approvalSettingsStateSchema>;
/** Only the requesting member's effective mode; account rules stay private. */
export const effectiveApprovalModeSchema = z.strictObject({
  spaceId: spaceIdSchema,
  mode: approvalModeSchema,
  source: z.enum(["space_override", "account_default"]),
  availableModes: z.array(approvalModeAvailabilitySchema).length(3),
});
export type EffectiveApprovalMode = z.infer<typeof effectiveApprovalModeSchema>;
export const approvalRequestIdSchema = z.string().min(1).max(128).brand<"ApprovalRequestId">();
export const approvalStateSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "cancelled",
]);
export type ApprovalState = z.infer<typeof approvalStateSchema>;
export const MAX_APPROVAL_ARGUMENTS = 131_072;
export const MAX_TOOL_RESULT = 16_384;
export const toolArgumentsSchema = z
  .record(z.string(), z.json())
  .refine(
    (value) => JSON.stringify(value).length <= MAX_APPROVAL_ARGUMENTS,
    "Tool input too large",
  );
export const approvalCardFields = {
  requestId: approvalRequestIdSchema,
  toolCallId: z.string().min(1).max(128).optional(),
  runId: runIdSchema,
  toolName: toolNameSchema,
  argumentSummary: z.string().max(1_024),
  target: z.string().min(1).max(1_024),
  memberAccountId: z.string().min(1).max(128),
  expiresAt: z.iso.datetime(),
};
export const approvalRequestSchema = z.strictObject({
  id: approvalRequestIdSchema,
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  runId: runIdSchema,
  memberAccountId: z.string().min(1).max(128),
  toolCallId: z.string().min(1).max(128),
  toolName: toolNameSchema,
  arguments: toolArgumentsSchema,
  argumentSummary: approvalCardFields.argumentSummary,
  target: approvalCardFields.target,
  state: approvalStateSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  answeredByAccountId: z.string().min(1).max(128).nullable(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export const effectSchema = z.strictObject({
  spaceId: spaceIdSchema,
  key: z.string().regex(/^[a-f0-9]{64}$/),
  conversationId: conversationIdSchema,
  runId: runIdSchema,
  toolCallId: z.string().min(1).max(128),
  toolName: toolNameSchema,
  argumentHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["intent", "succeeded", "failed", "unknown"]),
  result: z.string().max(MAX_TOOL_RESULT).nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Effect = z.infer<typeof effectSchema>;
