import { z } from "zod";
import { terminalProviderSchema, decisionSchema, questionSchema } from "@raypx/core/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";

export const TERMINAL_PROTOCOL_VERSION = 1 as const;
export const TERMINAL_DEFAULT_WAIT_SECONDS = 300;
export const TERMINAL_MAX_WAIT_SECONDS = 600;
export const TERMINAL_HOOK_TIMEOUT_SECONDS = 630;
const wellFormed = (value: string) => normalizeTaskJson(value) === value;

export const terminalCapabilitiesSchema = z.object({
  permission: z.boolean(),
  permissionTools: z.array(z.enum(["Bash", "apply_patch", "MCP"])).max(3),
  question: z.boolean(),
  plan: z.boolean(),
  simultaneousAnswers: z.literal(false),
  requiresHookTrust: z.boolean(),
});
export const terminalSessionSchema = z.object({
  id: z.string().uuid(),
  provider: terminalProviderSchema,
  providerSessionId: z.string().min(1).max(500).refine(wellFormed),
  projectId: z.string().min(1).max(200),
  projectName: z.string().max(120).optional(),
  capabilities: terminalCapabilitiesSchema,
});
export const terminalRequestSchema = z.object({
  version: z.literal(TERMINAL_PROTOCOL_VERSION),
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  epoch: z.string().uuid(),
  revision: z.number().int().positive(),
  provider: terminalProviderSchema,
  invocationId: z.string().uuid(),
  kind: z.enum(["permission", "question", "plan"]),
  title: z.string().min(1).max(500).refine(wellFormed),
  // Encoding is explicit so later ciphertext never masquerades as a plain body.
  encoding: z.literal("plain"),
  body: z.string().max(128_000).refine(wellFormed),
  questions: z.array(questionSchema).max(10),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  status: z.enum([
    "pending",
    "decided",
    "delivered",
    "applied",
    "expired",
    "cancelled",
    "outcome_unknown",
  ]),
  decision: decisionSchema.nullable(),
});
export const terminalDecisionSchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  revision: z.number().int().positive(),
  epoch: z.string().uuid(),
  decision: decisionSchema,
});
export type TerminalSession = z.infer<typeof terminalSessionSchema>;
export type TerminalRequest = z.infer<typeof terminalRequestSchema>;
export type TerminalDecision = z.infer<typeof terminalDecisionSchema>;
export const terminalRequestSummarySchema = terminalRequestSchema.omit({
  body: true,
  questions: true,
  decision: true,
});
export type TerminalRequestSummary = z.infer<typeof terminalRequestSummarySchema>;

export const observedProjectionSchema = z.object({
  sessions: z
    .array(
      terminalSessionSchema.extend({
        deviceId: z.string().uuid(),
        deviceName: z.string().max(120),
      }),
    )
    .max(100),
  requests: z.array(terminalRequestSummarySchema.extend({ deviceId: z.string().uuid() })).max(100),
});
export type ObservedProjection = z.infer<typeof observedProjectionSchema>;

export const hostAuthorizationSchema = z.object({
  accountId: z.string().min(1).max(200),
  deviceId: z.string().uuid(),
  epoch: z.number().int().positive(),
  credential: z.string().min(64).max(200),
  expiresAt: z.iso.datetime(),
});
export type HostAuthorization = z.infer<typeof hostAuthorizationSchema>;
const controlBindingSchema = z.object({ deviceId: z.uuid(), epoch: z.number().int().positive() });
export const controlInfoSchema = z.object({
  installationId: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  connected: z.boolean(),
  pendingRevoke: controlBindingSchema.nullable(),
  binding: controlBindingSchema.nullable(),
  error: z.string().nullable(),
  daemon: z.boolean().optional(),
  persistent: z.boolean().optional(),
  authorized: z.boolean().optional(),
  terminalSupported: z.boolean().optional(),
});
export type ControlInfo = z.infer<typeof controlInfoSchema>;

/** The same permission gate is used by protocol parsing, hook installation and UI. */
export function terminalPermissionSupported(
  capabilities: TerminalSession["capabilities"],
  tool: string,
) {
  return (
    capabilities.permission &&
    capabilities.permissionTools.some(
      (value) => value === tool || (value === "MCP" && /^mcp__[^\s]+$/.test(tool)),
    )
  );
}
export function terminalPermissionMatcher(capabilities: TerminalSession["capabilities"]) {
  return capabilities.permission
    ? capabilities.permissionTools.map((tool) => (tool === "MCP" ? "mcp__.*" : tool)).join("|")
    : "(?!)";
}
