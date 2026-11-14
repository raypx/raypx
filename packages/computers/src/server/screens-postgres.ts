import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  computerScreenControls as controls,
  computerScreenViewers as viewers,
  computers,
  spaces,
  spaceMembers,
  user,
  spaceAudit,
} from "@raypx/database/schema";
import { computerScreenControlSchema, type ComputerScreenControl } from "@raypx/core/computers";
import { SpaceNotFound, SpaceMutationError } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAuditWriter, type SpaceTransaction } from "@raypx/spaces/server/postgres";
import type { ComputerRef } from "@raypx/providers/computer";
import {
  ComputerScreenError,
  COMPUTER_SCREEN_CONTROL_TTL_MS,
  type ComputerScreenRepository,
  type ComputerScreenReleaseReason,
} from "../screens.js";

type ControlRow = typeof controls.$inferSelect;
const key = (spaceId: string, computerId: string) =>
  and(eq(controls.spaceId, spaceId), eq(controls.computerId, computerId));
const viewerKey = (spaceId: string, computerId: string, viewerId: string) =>
  and(
    eq(viewers.spaceId, spaceId),
    eq(viewers.computerId, computerId),
    eq(viewers.viewerId, viewerId),
  );
const VIEWER_TTL_MS = 10_000;
async function lock(tx: SpaceTransaction, spaceId: string, computerId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"computer-screen:" + spaceId + ":" + computerId}, 0))`,
  );
}
async function endControl(
  tx: SpaceTransaction,
  row: ControlRow,
  actor: string,
  reason: ComputerScreenReleaseReason,
) {
  const operationId = crypto.randomUUID();
  const context = {
    spaceId: row.spaceId,
    actorAccountId: actor,
    action: "computer.takeover.ended",
    targetId: row.computerId,
  };
  try {
    await tx
      .insert(spaceAudit)
      .values({ ...context, operationId, id: crypto.randomUUID(), outcome: "pending" });
    await tx.delete(controls).where(and(key(row.spaceId, row.computerId), eq(controls.id, row.id)));
    await tx.insert(spaceAudit).values({
      ...context,
      operationId,
      id: crypto.randomUUID(),
      outcome: "succeeded",
      code: reason,
    });
  } catch {
    throw new SpaceMutationError("SPACE_AUDIT_UNAVAILABLE");
  }
}
export async function endComputerScreenControl(
  tx: SpaceTransaction,
  spaceId: string,
  computerId: string,
) {
  await lock(tx, spaceId, computerId);
  const [row] = await tx.select().from(controls).where(key(spaceId, computerId)).for("update");
  if (row) await endControl(tx, row, row.accountId, "computer_stopped");
  await tx
    .delete(viewers)
    .where(and(eq(viewers.spaceId, spaceId), eq(viewers.computerId, computerId)));
}
/** Also used by the membership transaction, after it has locked the Space row. */
export async function revokeComputerScreenControl(
  tx: SpaceTransaction,
  spaceId: string,
  accountId: string,
  reason: "membership_lost" = "membership_lost",
) {
  const rows = await tx
    .select()
    .from(controls)
    .where(and(eq(controls.spaceId, spaceId), eq(controls.accountId, accountId)));
  for (const row of rows) {
    await lock(tx, spaceId, row.computerId);
    const [current] = await tx
      .select()
      .from(controls)
      .where(and(key(spaceId, row.computerId), eq(controls.id, row.id)))
      .for("update");
    if (current) await endControl(tx, current, accountId, reason);
  }
  await tx
    .delete(viewers)
    .where(and(eq(viewers.spaceId, spaceId), eq(viewers.accountId, accountId)));
}
function view(row: ControlRow): ComputerScreenControl {
  return computerScreenControlSchema.parse({
    id: row.id,
    accountId: row.accountId,
    displayName: row.displayName,
    expiresAt: row.expiresAt.toISOString(),
  });
}
/** Cross-process takeover and input admission share one transaction advisory lock. */
export function createComputerScreenRepository(
  db: Database,
  options: { now?: () => Date; ttlMs?: number } = {},
): ComputerScreenRepository {
  const ttlMs = Math.min(
    options.ttlMs ?? COMPUTER_SCREEN_CONTROL_TTL_MS,
    COMPUTER_SCREEN_CONTROL_TTL_MS,
  );
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1)
    throw new ComputerScreenError("SCREEN_INVALID_INPUT");
  const writer = createSpaceAuditWriter(db);
  async function time(tx: SpaceTransaction) {
    if (options.now) return options.now();
    const [row] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    return new Date(row!.now);
  }
  async function liveViewer(
    tx: SpaceTransaction,
    scope: SpaceScope,
    ref: ComputerRef,
    viewerId: string,
    accountId = scope.member.accountId,
  ) {
    const [row] = await tx
      .select()
      .from(viewers)
      .where(
        and(
          viewerKey(scope.spaceId, ref.id, viewerId),
          eq(viewers.accountId, accountId),
          eq(viewers.generation, ref.generation),
        ),
      );
    return row && row.expiresAt.getTime() > (await time(tx)).getTime() ? row : null;
  }
  async function admitted(
    tx: SpaceTransaction,
    scope: SpaceScope,
    requireOwner = false,
    mode: "blocking" | "read" | "try" = "blocking",
  ) {
    // Match membership mutation's Space-before-screen lock order. Membership cannot
    // disappear while an admitted input is executing against the provider.
    const query = tx.select().from(spaces).where(eq(spaces.id, scope.spaceId));
    let rows: (typeof spaces.$inferSelect)[];
    if (mode === "read") rows = await query;
    else if (mode === "try") rows = await query.for("share", { noWait: true });
    else rows = await query.for("share");
    const [space] = rows;
    if (!space || space.deletionClaimedAt) throw new SpaceNotFound("SPACE_DELETING");
    const [member] = await tx
      .select()
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, scope.spaceId),
          eq(spaceMembers.accountId, scope.member.accountId),
        ),
      );
    if (!member) throw new SpaceNotFound();
    if (member.removedAt)
      throw new SpaceNotFound(
        member.removalReason === "left" ? "SPACE_MEMBER_LEFT" : "SPACE_MEMBER_REMOVED",
      );
    if (requireOwner && member.role !== "owner")
      throw new ComputerScreenError("SCREEN_OWNER_REQUIRED");
  }
  async function invalidControlReason(
    tx: SpaceTransaction,
    scope: SpaceScope,
    computer: typeof computers.$inferSelect | undefined,
    row: ControlRow,
  ): Promise<ComputerScreenReleaseReason | null> {
    if (row.expiresAt.getTime() <= (await time(tx)).getTime()) return "expired";
    if (!computer || computer.state !== "running" || computer.generation !== row.generation)
      return "computer_stopped";
    const [member] = await tx
      .select()
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, scope.spaceId),
          eq(spaceMembers.accountId, row.accountId),
          isNull(spaceMembers.removedAt),
        ),
      );
    if (!member) return "membership_lost";
    if (
      !(await liveViewer(
        tx,
        scope,
        { id: row.computerId, generation: row.generation },
        row.viewerId,
        row.accountId,
      ))
    )
      return "disconnected";
    return null;
  }
  async function current(tx: SpaceTransaction, scope: SpaceScope, ref: ComputerRef) {
    const [computer] = await tx
      .select()
      .from(computers)
      .where(and(eq(computers.spaceId, scope.spaceId), eq(computers.id, ref.id)))
      .for("share");
    const [row] = await tx.select().from(controls).where(key(scope.spaceId, ref.id)).for("update");
    if (row) {
      const reason = await invalidControlReason(tx, scope, computer, row);
      if (reason) {
        await endControl(tx, row, row.accountId, reason);
        return { computer, control: null };
      }
    }
    return { computer, control: row ?? null };
  }
  async function observedComputer(tx: SpaceTransaction, scope: SpaceScope, ref: ComputerRef) {
    const [computer] = await tx
      .select()
      .from(computers)
      .where(and(eq(computers.spaceId, scope.spaceId), eq(computers.id, ref.id)));
    if (
      !computer ||
      computer.state !== "running" ||
      computer.generation !== ref.generation ||
      computer.leaseOwner
    )
      throw new ComputerScreenError("SCREEN_NOT_RUNNING");
    return computer;
  }
  async function observing<T>(
    scope: SpaceScope,
    ref: ComputerRef,
    operation: (tx: SpaceTransaction, computer: typeof computers.$inferSelect) => Promise<T>,
  ) {
    return db.transaction(async (tx) => {
      // Viewer rows carry no authority. Fresh non-locking admission keeps frames
      // and heartbeats usable while a command holds the input/control gate.
      await admitted(tx, scope, false, "read");
      return operation(tx, await observedComputer(tx, scope, ref));
    });
  }
  async function expireWithoutWaiting(scope: SpaceScope, ref: ComputerRef) {
    try {
      await db.transaction(async (tx) => {
        // Keep the mutation lock order, but defer cleanup instead of waiting for
        // an in-flight input/command. Every actual grant admission still expires
        // and audits under the mandatory exclusive gate.
        await admitted(tx, scope, false, "try");
        const [attempt] = await tx.execute<{ acquired: boolean }>(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${"computer-screen:" + scope.spaceId + ":" + ref.id}, 0)) as acquired`,
        );
        if (attempt?.acquired) await current(tx, scope, ref);
      });
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "cause" in error &&
        error.cause &&
        typeof error.cause === "object" &&
        "code" in error.cause
          ? error.cause.code
          : undefined;
      if (code !== "55P03") throw error;
    }
  }
  async function locked<T>(
    scope: SpaceScope,
    ref: ComputerRef,
    execute: (tx: SpaceTransaction, row: ControlRow | null) => Promise<T>,
    owner = false,
  ) {
    const result = await db.transaction(
      async (tx): Promise<{ value: T } | { error: ComputerScreenError }> => {
        await admitted(tx, scope, owner);
        await lock(tx, scope.spaceId, ref.id);
        const value = await current(tx, scope, ref);
        if (
          !value.computer ||
          value.computer.state !== "running" ||
          value.computer.generation !== ref.generation ||
          value.computer.leaseOwner
        )
          return { error: new ComputerScreenError("SCREEN_NOT_RUNNING") };
        try {
          return { value: await execute(tx, value.control) };
        } catch (error) {
          // Lazy expiry and its audit must commit even when renewal is refused.
          if (error instanceof ComputerScreenError) return { error };
          throw error;
        }
      },
    );
    if ("error" in result) throw result.error;
    return result.value;
  }
  function assertOwner(
    row: ControlRow | null,
    accountId: string,
    grantId: string,
  ): asserts row is ControlRow {
    if (!row || row.id !== grantId || row.accountId !== accountId)
      throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED", row ? view(row) : null);
  }
  return {
    openViewer: (scope, ref, viewerId) =>
      observing(scope, ref, async (tx) => {
        await tx
          .delete(viewers)
          .where(
            and(
              eq(viewers.spaceId, scope.spaceId),
              eq(viewers.computerId, ref.id),
              lte(viewers.expiresAt, await time(tx)),
            ),
          );
        const [existing] = await tx
          .select()
          .from(viewers)
          .where(viewerKey(scope.spaceId, ref.id, viewerId));
        if (existing && existing.accountId !== scope.member.accountId)
          throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED");
        const [opened] = await tx
          .insert(viewers)
          .values({
            spaceId: scope.spaceId,
            computerId: ref.id,
            generation: ref.generation,
            accountId: scope.member.accountId,
            viewerId,
            expiresAt: new Date((await time(tx)).getTime() + VIEWER_TTL_MS),
          })
          .onConflictDoUpdate({
            target: [viewers.spaceId, viewers.computerId, viewers.viewerId],
            set: {
              generation: ref.generation,
              expiresAt: new Date((await time(tx)).getTime() + VIEWER_TTL_MS),
            },
            setWhere: eq(viewers.accountId, scope.member.accountId),
          })
          .returning({ viewerId: viewers.viewerId });
        if (!opened) throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED");
      }),
    touchViewer: (scope, ref, viewerId) =>
      observing(scope, ref, async (tx) => {
        if (!(await liveViewer(tx, scope, ref, viewerId)))
          throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED");
        // Never upsert: a heartbeat arriving after disconnect must not resurrect a view.
        const [touched] = await tx
          .update(viewers)
          .set({ expiresAt: new Date((await time(tx)).getTime() + VIEWER_TTL_MS) })
          .where(
            and(
              viewerKey(scope.spaceId, ref.id, viewerId),
              eq(viewers.accountId, scope.member.accountId),
              eq(viewers.generation, ref.generation),
              sql`${viewers.expiresAt} > clock_timestamp()`,
            ),
          )
          .returning({ viewerId: viewers.viewerId });
        if (!touched) throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED");
      }),
    async control(scope, ref) {
      const value = await observing(scope, ref, async (tx, computer) => {
        const [row] = await tx.select().from(controls).where(key(scope.spaceId, ref.id));
        if (!row) return { control: null, expired: false };
        const reason = await invalidControlReason(tx, scope, computer, row);
        return { control: reason ? null : view(row), expired: reason !== null };
      });
      if (value.expired) await expireWithoutWaiting(scope, ref);
      return value.control;
    },
    acquire: (scope, ref, viewerId) =>
      locked(scope, ref, async (tx, row) => {
        if (!(await liveViewer(tx, scope, ref, viewerId)))
          throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED");
        if (row) {
          if (row.accountId === scope.member.accountId && row.viewerId === viewerId)
            return view(row);
          throw new ComputerScreenError("SCREEN_CONTROL_HELD", view(row));
        }
        const [account] = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, scope.member.accountId));
        const createdAt = await time(tx);
        const id = crypto.randomUUID();
        const operationId = crypto.randomUUID();
        const context = {
          spaceId: scope.spaceId,
          actorAccountId: scope.member.accountId,
          action: "computer.takeover.started",
          targetId: ref.id,
        };
        await writer.append(tx, operationId, context, "pending");
        const [created] = await tx
          .insert(controls)
          .values({
            spaceId: scope.spaceId,
            computerId: ref.id,
            generation: ref.generation,
            id,
            accountId: scope.member.accountId,
            viewerId,
            displayName: (account?.name ?? "").slice(0, 200),
            createdAt,
            expiresAt: new Date(createdAt.getTime() + ttlMs),
          })
          .returning();
        await writer.succeed(tx, operationId, context);
        return view(created!);
      }),
    renew: (scope, ref, grantId) =>
      locked(scope, ref, async (tx, row) => {
        assertOwner(row, scope.member.accountId, grantId);
        const [renewed] = await tx
          .update(controls)
          .set({ expiresAt: new Date((await time(tx)).getTime() + ttlMs) })
          .where(and(key(scope.spaceId, ref.id), eq(controls.id, grantId)))
          .returning();
        return view(renewed!);
      }),
    release: (scope, ref, grantId) =>
      locked(scope, ref, async (tx, row) => {
        if (!row) return;
        assertOwner(row, scope.member.accountId, grantId);
        await endControl(tx, row, scope.member.accountId, "released");
      }),
    forceRelease: (scope, ref) =>
      locked(
        scope,
        ref,
        async (tx, row) => {
          if (row) await endControl(tx, row, scope.member.accountId, "forced");
        },
        true,
      ),
    async releaseViewer(scope, ref, viewerId) {
      // Cleanup has only the already-bound viewer identity and no resource read.
      // It must still work after that session or membership has been revoked.
      await db.transaction(async (tx) => {
        const [space] = await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(eq(spaces.id, scope.spaceId))
          .for("share");
        if (!space) return;
        await lock(tx, scope.spaceId, ref.id);
        const [row] = await tx
          .select()
          .from(controls)
          .where(
            and(
              key(scope.spaceId, ref.id),
              eq(controls.generation, ref.generation),
              eq(controls.accountId, scope.member.accountId),
              eq(controls.viewerId, viewerId),
            ),
          )
          .for("update");
        if (row) await endControl(tx, row, row.accountId, "disconnected");
        await tx
          .delete(viewers)
          .where(
            and(
              viewerKey(scope.spaceId, ref.id, viewerId),
              eq(viewers.accountId, scope.member.accountId),
              eq(viewers.generation, ref.generation),
            ),
          );
      });
    },
    withMemberInput: (scope, ref, grantId, operation) =>
      locked(scope, ref, async (_, row) => {
        assertOwner(row, scope.member.accountId, grantId);
        return operation();
      }),
    withAgentInput: (scope, ref, operation) =>
      locked(scope, ref, async (_, row) => {
        if (row) throw new ComputerScreenError("SCREEN_CONTROL_HELD", view(row));
        return operation();
      }),
    stop: (scope, ref, operation) =>
      locked(scope, ref, async (tx, row) => {
        if (row) await endControl(tx, row, scope.member.accountId, "screen_stopped");
        await tx
          .delete(viewers)
          .where(and(eq(viewers.spaceId, scope.spaceId), eq(viewers.computerId, ref.id)));
        return operation();
      }),
  };
}
