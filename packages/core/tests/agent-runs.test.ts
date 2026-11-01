import { describe, expect, it } from "vite-plus/test";
import {
  AgentRunTransitionError,
  agentExecutionTargetSchema,
  agentRunManifestSchema,
  transitionAgentRun,
} from "../src/agent-runs.js";

describe("Agent Run transitions", () => {
  it.each([
    ["queued", { type: "claim" }, "running"],
    ["queued", { type: "host_unavailable" }, "waiting_host"],
    ["running", { type: "wait", reason: "approval" }, "waiting_approval"],
    ["running", { type: "wait", reason: "input" }, "waiting_input"],
    ["running", { type: "wait", reason: "host" }, "waiting_host"],
    ["waiting_approval", { type: "resume" }, "queued"],
    ["waiting_input", { type: "resume" }, "queued"],
    ["waiting_host", { type: "resume" }, "queued"],
    ["running", { type: "cancel" }, "cancelling"],
    ["queued", { type: "cancel" }, "cancelled"],
    ["cancelling", { type: "cancelled" }, "cancelled"],
    ["running", { type: "succeeded" }, "succeeded"],
    ["running", { type: "failed" }, "failed"],
    ["running", { type: "interrupted" }, "interrupted"],
    ["running", { type: "effect_uncertain" }, "uncertain"],
    ["failed", { type: "retry" }, "queued"],
    ["interrupted", { type: "retry" }, "queued"],
    ["uncertain", { type: "reconcile", outcome: "succeeded" }, "succeeded"],
    ["uncertain", { type: "reconcile", outcome: "failed" }, "failed"],
  ] as const)("transitions %s via %j to %s", (from, transition, to) => {
    expect(transitionAgentRun(from, transition)).toBe(to);
  });

  it("does not retry an uncertain external effect before reconciliation", () => {
    expect(() => transitionAgentRun("uncertain", { type: "retry" })).toThrow(
      AgentRunTransitionError,
    );
  });

  it("rejects stale transitions from terminal states", () => {
    expect(() => transitionAgentRun("succeeded", { type: "claim" })).toThrow(
      AgentRunTransitionError,
    );
  });

  it("allows the run to finish if cancellation races with a completed effect", () => {
    const status = transitionAgentRun("running", { type: "cancel" });
    expect(transitionAgentRun(status, { type: "succeeded" })).toBe("succeeded");
  });
});

describe("Agent Run manifest", () => {
  const manifest = {
    agentRevision: 3,
    policyRevision: 2,
    model: {
      connectionId: "model-connection",
      connectionRevision: 4,
      provider: "openai-compatible",
      modelId: "model-a",
    },
    target: {
      kind: "local_host",
      hostId: "host-a",
      projectId: "project-a",
    },
    trigger: { kind: "user", id: "message-a", revision: 1 },
    references: [{ id: "context-a", revision: 5 }],
  } as const;

  it("captures configuration, model, authorization, target, and context revisions", () => {
    expect(agentRunManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("supports a server-owned execution target", () => {
    expect(
      agentExecutionTargetSchema.parse({ kind: "server_computer", computerId: "computer-a" }),
    ).toEqual({ kind: "server_computer", computerId: "computer-a" });
  });

  it("rejects unversioned context or an unrecognized target", () => {
    expect(
      agentRunManifestSchema.safeParse({
        ...manifest,
        references: [{ id: "context-a", revision: 0 }],
      }).success,
    ).toBe(false);
    expect(agentExecutionTargetSchema.safeParse({ kind: "anywhere" }).success).toBe(false);
  });
});
