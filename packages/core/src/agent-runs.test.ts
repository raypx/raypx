import { describe, expect, it } from "vite-plus/test";
import {
  AgentRunProjectionError,
  AgentRunTransitionError,
  agentExecutionTargetSchema,
  agentRunManifestSchema,
  projectTaskStatusToRunStatus,
  transitionAgentRun,
} from "./agent-runs.js";

describe("Agent Run transitions", () => {
  it.each([
    ["queued", { type: "claim" }, "running"],
    ["queued", { type: "host_unavailable" }, "waiting_host"],
    ["running", { type: "wait", reason: "approval" }, "waiting_approval"],
    ["running", { type: "wait", reason: "input" }, "waiting_input"],
    ["running", { type: "wait", reason: "host" }, "waiting_host"],
    ["waiting_approval", { type: "resume" }, "running"],
    ["waiting_input", { type: "resume" }, "running"],
    ["waiting_host", { type: "resume" }, "queued"],
    ["running", { type: "cancel" }, "cancelling"],
    ["waiting_approval", { type: "cancel" }, "cancelling"],
    ["waiting_input", { type: "cancel" }, "cancelling"],
    ["waiting_host", { type: "cancel" }, "cancelled"],
    ["queued", { type: "owner_lost" }, "interrupted"],
    ["running", { type: "owner_lost" }, "interrupted"],
    ["waiting_approval", { type: "owner_lost" }, "interrupted"],
    ["waiting_input", { type: "owner_lost" }, "interrupted"],
    ["waiting_host", { type: "owner_lost" }, "interrupted"],
    ["cancelling", { type: "owner_lost" }, "interrupted"],
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

  it.each(["succeeded", "failed", "cancelled", "interrupted", "uncertain"] as const)(
    "does not replace durable %s outcomes when the owner is lost",
    (status) => {
      expect(() => transitionAgentRun(status, { type: "owner_lost" })).toThrow(
        AgentRunTransitionError,
      );
    },
  );

  it.each(["permission", "plan", "question"] as const)(
    "matches local wait, resume and cancellation for a %s request",
    (kind) => {
      const waiting = projectTaskStatusToRunStatus({ status: "waiting" }, kind);
      expect(transitionAgentRun(waiting, { type: "resume" })).toBe(
        projectTaskStatusToRunStatus({ status: "running" }),
      );
      const cancelling = transitionAgentRun(waiting, { type: "cancel" });
      expect(cancelling).toBe(projectTaskStatusToRunStatus({ status: "cancelling" }));
      expect(transitionAgentRun(cancelling, { type: "cancelled" })).toBe(
        projectTaskStatusToRunStatus({ status: "cancelled" }),
      );
    },
  );

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

describe("Agent Task status projection", () => {
  it.each([
    ["pending", "queued"],
    ["running", "running"],
    ["cancelling", "cancelling"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["delivery_failed", "failed"],
    ["cancelled", "cancelled"],
    ["interrupted", "interrupted"],
  ] as const)("projects %s to %s", (status, expected) => {
    expect(projectTaskStatusToRunStatus({ status })).toBe(expected);
  });

  it.each([
    ["permission", "waiting_approval"],
    ["plan", "waiting_approval"],
    ["question", "waiting_input"],
  ] as const)("projects a waiting task with a %s request to %s", (kind, expected) => {
    expect(projectTaskStatusToRunStatus({ status: "waiting" }, kind)).toBe(expected);
  });

  it("requires request context to distinguish approval from input", () => {
    expect(() => projectTaskStatusToRunStatus({ status: "waiting" })).toThrow(
      AgentRunProjectionError,
    );
  });
});
