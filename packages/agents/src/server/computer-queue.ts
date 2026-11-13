import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  conversationCounters as counters,
  conversationRuns as runs,
  spaces,
  conversationEffects as effects,
} from "@raypx/database/schema";
import type { ComputerUseQueue } from "../computer-tools.js";
import { assertRunFence } from "./fence.js";
import { EFFECT_INTENT_TIMEOUT_MS } from "../tool-limits.js";

/** Run leases fence the driver; the Agent row serializes acquisition across conversations. */
export function createComputerUseQueue(db: Pick<Database, "transaction">): ComputerUseQueue {
  return {
    async acquire(scope, run) {
      return db.transaction(async (tx) => {
        await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(eq(spaces.id, scope.spaceId))
          .for("share");
        await tx
          .select()
          .from(counters)
          .where(
            and(
              eq(counters.spaceId, scope.spaceId),
              eq(counters.conversationId, run.conversationId),
            ),
          )
          .for("update");
        await tx
          .select()
          .from(agents)
          .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, run.agentId)))
          .for("update");
        const current = await assertRunFence(tx, scope, run);
        const [holder] = await tx
          .select({ id: runs.id })
          .from(runs)
          .where(
            and(
              eq(runs.spaceId, scope.spaceId),
              eq(runs.agentId, run.agentId),
              or(
                and(
                  eq(runs.computerHeld, true),
                  inArray(runs.state, ["running", "waiting"]),
                  gt(runs.leaseExpiresAt, sql`clock_timestamp()`),
                ),
                sql`exists (select 1 from ${effects} where ${effects.spaceId} = ${runs.spaceId} and ${effects.conversationId} = ${runs.conversationId} and ${effects.runId} = ${runs.id} and ${effects.toolName} in ('computer_write_file', 'computer_run_command') and ${effects.state} = 'intent' and ${effects.createdAt} + ${EFFECT_INTENT_TIMEOUT_MS} * interval '1 millisecond' > clock_timestamp())`,
              ),
              sql`${runs.id} <> ${run.id}`,
            ),
          )
          .orderBy(runs.createdAt, runs.id)
          .limit(1);
        if (holder) return false;
        await tx
          .update(runs)
          .set({ computerHeld: true })
          .where(
            and(
              eq(runs.spaceId, scope.spaceId),
              eq(runs.conversationId, run.conversationId),
              eq(runs.id, run.id),
              eq(runs.fence, current.fence),
              eq(runs.leaseOwner, run.ownerId),
            ),
          );
        return true;
      });
    },
    async release(scope, run) {
      await db.transaction(async (tx) => {
        await tx
          .select()
          .from(counters)
          .where(
            and(
              eq(counters.spaceId, scope.spaceId),
              eq(counters.conversationId, run.conversationId),
            ),
          )
          .for("update");
        // Cancellation/recovery may already have revoked this attempt. It cannot
        // release a newer owner's slot, nor needs to revive a terminal lease.
        await tx
          .update(runs)
          .set({ computerHeld: false })
          .where(
            and(
              eq(runs.spaceId, scope.spaceId),
              eq(runs.conversationId, run.conversationId),
              eq(runs.id, run.id),
              eq(runs.fence, run.fence),
              eq(runs.leaseOwner, run.ownerId),
            ),
          );
      });
    },
  };
}
