import { z } from "zod";
import { agentProviderSchema, decisionSchema, questionSchema } from "./human.js";
import { normalizeTaskJson } from "./task-text.js";

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
  provider: agentProviderSchema,
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
  provider: agentProviderSchema,
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
export interface ControlInfo {
  installationId: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  pendingRevoke: { deviceId: string; epoch: number } | null;
  binding: { deviceId: string; epoch: number } | null;
  error: string | null;
  daemon?: boolean;
  persistent?: boolean;
  authorized?: boolean;
}
