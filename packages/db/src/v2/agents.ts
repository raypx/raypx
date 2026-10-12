import { first, inserted } from "./results.js";
import type { AgentRunV2, AgentRunV2Repository } from "@voidmix/core";
import { eq } from "drizzle-orm";
import { v2AgentRuns, outboxEvents } from "../schema/resources.js";
import type { Database } from "./types.js";

export class PostgresAgentRunV2Repository implements AgentRunV2Repository {
  constructor(private readonly db: Database) {}

  async getById(id: string): Promise<AgentRunV2 | null> {
    return first(this.db.select().from(v2AgentRuns).where(eq(v2AgentRuns.id, id)).limit(1));
  }

  async create({
    now,
    ...record
  }: Parameters<AgentRunV2Repository["create"]>[0]): Promise<AgentRunV2> {
    return inserted(
      this.db
        .insert(v2AgentRuns)
        .values({
          ...record,
          status: "queued",
          output: null,
          error: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      "Agent run insert",
    );
  }

  async createQueued(input: Parameters<AgentRunV2Repository["create"]>[0]): Promise<AgentRunV2> {
    return this.db.transaction(async (tx) => {
      const run = await new PostgresAgentRunV2Repository(tx).create(input);
      await tx.insert(outboxEvents).values({
        id: `agent-run-${run.id}`,
        type: "agent.run.queued",
        payload: { runId: run.id, projectId: run.projectId, attempt: run.attempt },
        availableAt: input.now,
        createdAt: input.now,
      });
      return run;
    });
  }

  async updateStatus(
    input: Parameters<AgentRunV2Repository["updateStatus"]>[0],
  ): Promise<AgentRunV2 | null> {
    return first(
      this.db
        .update(v2AgentRuns)
        .set({
          status: input.status,
          ...(input.output !== undefined ? { output: input.output } : {}),
          ...(input.error !== undefined ? { error: input.error } : {}),
          updatedAt: input.now,
        })
        .where(eq(v2AgentRuns.id, input.id))
        .returning(),
    );
  }
}
