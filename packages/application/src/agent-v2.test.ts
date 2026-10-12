import { describe, expect, it } from "vite-plus/test";
import type { AgentRunV2, AgentRunV2Repository } from "@voidmix/core";

import { createAgentRunApplication, type AgentRunApplication } from "./agent-v2.js";

const projectAccess = {
  assertCapability: async () => ({}) as never,
};

describe("V2 AgentRun application", () => {
  it("creates, cancels, and retries runs with increasing attempts", async () => {
    const runs = new Map<string, AgentRunV2>();
    const repository: AgentRunV2Repository = {
      getById: async (id) => runs.get(id) ?? null,
      create: async (input) => {
        const run: AgentRunV2 = {
          id: input.id,
          projectId: input.projectId,
          requestedByUserId: input.requestedByUserId,
          assetVersionId: input.assetVersionId,
          status: "queued",
          attempt: input.attempt,
          input: input.input,
          output: null,
          error: null,
          createdAt: input.now,
          updatedAt: input.now,
        };
        runs.set(run.id, run);
        return run;
      },
      updateStatus: async (input) => {
        const current = runs.get(input.id);
        if (!current) return null;
        const updated = { ...current, status: input.status, updatedAt: input.now };
        runs.set(input.id, updated);
        return updated;
      },
    };
    let sequence = 0;
    const app: AgentRunApplication = createAgentRunApplication({
      projects: projectAccess as never,
      runs: repository,
      now: () => new Date(1_000 + sequence++),
      id: () => `run-${sequence}`,
    });

    const created = await app.create({
      actorId: "user-1",
      projectId: "project-1",
      idempotencyKey: "test-1",
      input: { goal: "test" },
    });
    expect(created.status).toBe("queued");
    const cancelled = await app.cancel({ actorId: "user-1", runId: created.id });
    expect(cancelled.status).toBe("cancelled");
    const retried = await app.retry({ actorId: "user-1", runId: created.id });
    expect(retried.attempt).toBe(2);
  });
});
