import { z } from "zod";
import { conversationIdSchema } from "./agents.js";
import { runIdSchema } from "./run-identity.js";
import { spaceIdSchema } from "./spaces.js";

export const computerToolNameSchema = z.enum([
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "computer_run_command",
]);
export type ComputerToolName = z.infer<typeof computerToolNameSchema>;
export const approvalModeSchema = z.enum(["ask", "never"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;
// Accept the explicit choice at the boundary so the service can report unavailability.
export const approvalModeInputSchema = z.enum(["ask", "never", "auto"]);
export const approvalRuleSchema = z
  .strictObject({
    toolName: computerToolNameSchema,
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
  runId: runIdSchema,
  toolName: computerToolNameSchema,
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
  toolName: computerToolNameSchema,
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
  toolName: computerToolNameSchema,
  argumentHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["intent", "succeeded", "failed", "unknown"]),
  result: z.string().max(MAX_TOOL_RESULT).nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Effect = z.infer<typeof effectSchema>;
