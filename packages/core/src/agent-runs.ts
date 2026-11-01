import { z } from "zod";

export const agentRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_approval",
  "waiting_input",
  "waiting_host",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "uncertain",
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const agentExecutionTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local_host"),
    hostId: z.string().min(1).max(200),
    projectId: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal("server_computer"),
    computerId: z.string().min(1).max(200),
  }),
]);
export type AgentExecutionTarget = z.infer<typeof agentExecutionTargetSchema>;

export const agentRunManifestSchema = z.object({
  agentRevision: z.number().int().positive(),
  policyRevision: z.number().int().positive(),
  model: z.object({
    connectionId: z.string().min(1).max(200),
    connectionRevision: z.number().int().positive(),
    provider: z.string().min(1).max(80),
    modelId: z.string().min(1).max(200),
  }),
  target: agentExecutionTargetSchema,
  trigger: z.object({
    kind: z.enum(["user", "routine", "webhook", "message"]),
    id: z.string().min(1).max(200),
    revision: z.number().int().positive(),
  }),
  references: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        revision: z.number().int().positive(),
      }),
    )
    .max(64),
});
export type AgentRunManifest = z.infer<typeof agentRunManifestSchema>;

export const agentRunTransitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("claim") }),
  z.object({ type: z.literal("host_unavailable") }),
  z.object({ type: z.literal("wait"), reason: z.enum(["approval", "input", "host"]) }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("cancelled") }),
  z.object({ type: z.literal("succeeded") }),
  z.object({ type: z.literal("failed") }),
  z.object({ type: z.literal("interrupted") }),
  z.object({ type: z.literal("effect_uncertain") }),
  z.object({ type: z.literal("retry") }),
  z.object({ type: z.literal("reconcile"), outcome: z.enum(["succeeded", "failed"]) }),
]);
export type AgentRunTransition = z.infer<typeof agentRunTransitionSchema>;

export class AgentRunTransitionError extends Error {
  readonly code = "INVALID_AGENT_RUN_TRANSITION";

  constructor(
    readonly status: AgentRunStatus,
    readonly transition: AgentRunTransition["type"],
  ) {
    super(`Cannot apply ${transition} to a ${status} run.`);
    this.name = "AgentRunTransitionError";
  }
}

/** Pure transition rules shared by local and server persistence adapters. */
export function transitionAgentRun(
  status: AgentRunStatus,
  transition: AgentRunTransition,
): AgentRunStatus {
  switch (transition.type) {
    case "claim":
      if (status === "queued") return "running";
      break;
    case "host_unavailable":
      if (status === "queued") return "waiting_host";
      break;
    case "wait":
      if (status === "running") {
        if (transition.reason === "approval") return "waiting_approval";
        if (transition.reason === "input") return "waiting_input";
        return "waiting_host";
      }
      break;
    case "resume":
      if (status === "waiting_approval" || status === "waiting_input" || status === "waiting_host")
        return "queued";
      break;
    case "cancel":
      if (status === "queued" || status.startsWith("waiting_")) return "cancelled";
      if (status === "running") return "cancelling";
      break;
    case "cancelled":
      if (status === "cancelling") return "cancelled";
      break;
    case "succeeded":
    case "failed":
    case "interrupted":
      if (status === "running" || status === "cancelling") return transition.type;
      break;
    case "effect_uncertain":
      if (status === "running" || status === "cancelling") return "uncertain";
      break;
    case "retry":
      if (status === "failed" || status === "interrupted") return "queued";
      break;
    case "reconcile":
      if (status === "uncertain") return transition.outcome;
      break;
  }
  throw new AgentRunTransitionError(status, transition.type);
}
