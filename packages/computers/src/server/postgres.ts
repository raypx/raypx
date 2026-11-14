import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  computers,
  spaces,
  conversations,
  conversationCounters as counters,
  conversationEvents as events,
} from "@raypx/database/schema";
import { computerSchema, type Computer } from "@raypx/core/computers";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import { ComputerOperationError, type ComputersRepository } from "../server.js";
import { endComputerScreenControl } from "./screens-postgres.js";
export { createComputerScreenRepository, revokeComputerScreenControl } from "./screens-postgres.js";

function view(row: typeof computers.$inferSelect): Computer {
  const { createdByAccountId: _, ...rest } = row;
  return computerSchema.parse({
    ...rest,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
  });
}
/** Notifications contain identifiers only and are delivered by PostgreSQL after commit. */
export function createComputersRepository(
  db: Database,
  limits = { perSpace: 1, perMember: 10 },
): ComputersRepository {
  const team = (scope: SpaceScope) =>
    and(eq(computers.spaceId, scope.spaceId), eq(computers.scope, "team"));
  type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
  async function emit(tx: Transaction, scope: SpaceScope, computer: Computer) {
    const affected = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.spaceId, scope.spaceId))
      .orderBy(asc(conversations.id))
      .for("key share");
    for (const conversation of affected) {
      const selection = and(
        eq(counters.spaceId, scope.spaceId),
        eq(counters.conversationId, conversation.id),
      );
      await tx
        .insert(counters)
        .values({ spaceId: scope.spaceId, conversationId: conversation.id })
        .onConflictDoNothing();
      const [counter] = await tx.select().from(counters).where(selection).for("update");
      const sequence = counter!.sequence + 1;
      await tx.insert(events).values({
        spaceId: scope.spaceId,
        conversationId: conversation.id,
        sequence,
        kind: "computer.state",
        computerId: computer.id,
        data: {
          state: computer.state,
          generation: computer.generation,
          homeRevision: computer.homeRevision,
        },
      });
      await tx.update(counters).set({ sequence }).where(selection);
      await tx.execute(
        sql`select pg_notify('raypx_conversation_events', ${JSON.stringify({ conversationId: conversation.id, sequence })})`,
      );
    }
  }
  return {
    async get(scope) {
      const [row] = await db.select().from(computers).where(team(scope));
      return row ? view(row) : null;
    },
    async claim(scope, operation, provider) {
      return db.transaction(async (tx) => {
        // Serialize quota admission without locking a user row referenced by message writes.
        // Message writes already hold a conversation counter before checking their author FK.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"computer-member:" + scope.member.accountId}, 0))`,
        );
        const [space] = await tx
          .select()
          .from(spaces)
          .where(eq(spaces.id, scope.spaceId))
          .for("update");
        if (!space) throw new SpaceNotFound();
        let [row] = await tx.select().from(computers).where(team(scope)).for("update");
        const created = !row;
        if (!row) {
          if (operation === "stop") throw new SpaceNotFound();
          const [spaceCount] = await tx
            .select({ value: count() })
            .from(computers)
            .where(and(eq(computers.spaceId, scope.spaceId), sql`${computers.scope} <> 'device'`));
          // Account-owned quota admission is the only cross-Space aggregate; it returns no content.
          const [memberCount] = await tx
            .select({ value: count() })
            .from(computers)
            .where(
              and(
                eq(computers.createdByAccountId, scope.member.accountId),
                sql`${computers.scope} <> 'device'`,
              ),
            );
          if (spaceCount!.value >= limits.perSpace || memberCount!.value >= limits.perMember)
            throw new ComputerOperationError("COMPUTER_LIMIT");
          [row] = await tx
            .insert(computers)
            .values({
              id: crypto.randomUUID(),
              spaceId: scope.spaceId,
              scope: "team",
              provider,
              createdByAccountId: scope.member.accountId,
            })
            .returning();
        }
        // Another caller can complete after the service's read and before this
        // Space lock. Satisfy the requested target without replacing its generation.
        const targetState = operation === "start" ? "running" : "stopped";
        if (!row!.leaseOwner && row!.state === targetState) return view(row!);
        const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
        const time = new Date(clock!.now);
        if (row!.leaseExpiresAt && row!.leaseExpiresAt > time)
          throw new ComputerOperationError("COMPUTER_BUSY");
        // Stop never takes over an unfinished start: only a new generation may recover it.
        if (operation === "stop" && row!.state === "starting")
          throw new ComputerOperationError("COMPUTER_BUSY");
        await endComputerScreenControl(tx, scope.spaceId, row!.id);
        let generation = row!.generation;
        if (operation === "start" && !created) generation += 1;
        const [claimed] = await tx
          .update(computers)
          .set({
            state: operation === "start" ? "starting" : "stopping",
            generation,
            leaseOwner: crypto.randomUUID(),
            leaseExpiresAt: new Date(time.getTime() + 300_000),
            leaseFence: row!.leaseFence + 1,
            failureCode: null,
            updatedAt: time,
          })
          .where(team(scope))
          .returning();
        const computer = view(claimed!);
        await emit(tx, scope, computer);
        return computer;
      });
    },
    async observe(scope, expected, result) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(computers)
          .set({ ...result, updatedAt: new Date() })
          .where(
            and(
              team(scope),
              eq(computers.id, expected.id),
              eq(computers.generation, expected.generation),
              eq(computers.leaseFence, expected.leaseFence),
              eq(computers.state, "running"),
              isNull(computers.leaseOwner),
            ),
          )
          .returning();
        if (!row) throw new ComputerOperationError("COMPUTER_BUSY");
        const computer = view(row);
        await emit(tx, scope, computer);
        return computer;
      });
    },
    async complete(scope, claim, result) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(computers)
          .set({ ...result, leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
          .where(
            and(
              team(scope),
              eq(computers.id, claim.id),
              eq(computers.generation, claim.generation),
              eq(computers.leaseFence, claim.leaseFence),
              eq(computers.leaseOwner, claim.leaseOwner!),
              gt(computers.leaseExpiresAt, sql`clock_timestamp()`),
            ),
          )
          .returning();
        if (!row) throw new ComputerOperationError("COMPUTER_BUSY");
        const computer = view(row);
        await emit(tx, scope, computer);
        return computer;
      });
    },
  };
}

export { createDeviceComputersRepository } from "./devices-postgres.js";

export {
  createDeviceMemberFilesRepository,
  createDeviceMemberFilesService,
} from "./member-files.js";
