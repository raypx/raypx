import { describe, expect, it } from "vite-plus/test";
import { PostgresAgentRunV2Repository } from "./agents.js";
import { outboxEvents, v2AgentRuns } from "../schema/resources.js";

describe("queued Agent transaction", () => {
  it.each([false, true])(
    "keeps the run and outbox atomic (outbox fails: %s)",
    async (failOutbox) => {
      const committed: unknown[] = [];
      const failure = new Error("outbox unavailable");
      const db = {
        insert() {
          throw new Error("write escaped transaction");
        },
        async transaction<T>(operation: (tx: unknown) => Promise<T>) {
          const pending: unknown[] = [];
          const result = await operation({
            insert: (table: unknown) => ({
              values: (row: object) => {
                if (table === outboxEvents && failOutbox) throw failure;
                pending.push({ table, row });
                return { returning: async () => [row] };
              },
            }),
          });
          committed.push(...pending);
          return result;
        },
      };
      const repo = new PostgresAgentRunV2Repository(
        db as unknown as ConstructorParameters<typeof PostgresAgentRunV2Repository>[0],
      );
      const now = new Date(0);
      const result = repo.createQueued({
        id: "run-1",
        projectId: "project-1",
        requestedByUserId: "user-1",
        assetVersionId: null,
        attempt: 1,
        input: {},
        now,
      });
      if (failOutbox) {
        await expect(result).rejects.toBe(failure);
        expect(committed).toEqual([]);
      } else {
        await expect(result).resolves.toMatchObject({
          id: "run-1",
          status: "queued",
          createdAt: now,
          updatedAt: now,
        });
        expect(committed).toEqual([
          { table: v2AgentRuns, row: expect.objectContaining({ id: "run-1", status: "queued" }) },
          {
            table: outboxEvents,
            row: {
              id: "agent-run-run-1",
              type: "agent.run.queued",
              payload: { runId: "run-1", projectId: "project-1", attempt: 1 },
              availableAt: now,
              createdAt: now,
            },
          },
        ]);
      }
    },
  );
});
