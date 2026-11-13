import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { conversationRuns as runs, spaceMembers, spaces } from "@raypx/database/schema";
import type { SpaceScope } from "@raypx/spaces/server";
import { StaleRunFenceError, type ExecutionRun } from "../conversations.js";

/** Lock order is conversation counter, then Run. Hold this lock through every attempt write. */
export async function assertRunFence(
  tx: Pick<Database, "select">,
  scope: SpaceScope,
  run: ExecutionRun,
) {
  const [current] = await tx
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.spaceId, scope.spaceId),
        eq(runs.conversationId, run.conversationId),
        eq(runs.id, run.id),
        eq(runs.leaseOwner, run.ownerId),
        eq(runs.fence, run.fence),
        gt(runs.leaseExpiresAt, sql`clock_timestamp()`),
        inArray(runs.state, ["running", "waiting"]),
        sql`exists (select 1 from ${spaceMembers} inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId} where ${spaceMembers.spaceId} = ${runs.spaceId} and ${spaceMembers.accountId} = ${runs.memberAccountId} and ${spaceMembers.removedAt} is null and ${spaces.deletionClaimedAt} is null)`,
      ),
    )
    .for("update");
  if (!current) throw new StaleRunFenceError();
  return current;
}
