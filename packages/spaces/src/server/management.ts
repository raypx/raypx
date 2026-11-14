import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  spaces,
  spaceMembers,
  user,
  spaceInvitations,
  spaceSettingsOverrides,
  spaceAudit,
  spaceEvents,
  spaceDeletionJobs,
  routines,
  routineSecrets,
  modelConnectionSpaces,
  memberSkillSpaces,
  agentMemberSkills,
  agentSpaceSkills,
  mcpServerSpaces,
  agentMcpServers,
} from "@raypx/database/schema";
import {
  SpaceMutationError,
  SpaceNotFound,
  spaceSchema,
  spaceMemberSchema,
  spaceInvitationSchema,
  spaceAuditEntrySchema,
  spaceEventSchema,
  spaceInputSchema,
  type Space,
  type SpaceMember,
  type SpaceId,
  type SpaceSettings,
} from "@raypx/core/spaces";
import type { SpaceManagement, SpaceScope, SpaceMemberRemoval } from "../server.js";

export type SpaceTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export interface SpaceManagementHooks {
  /** Deployment review capability; it grants no Space access or member credentials. */
  reviewModelAvailable?(): boolean | Promise<boolean>;
  /** Cancels Runs/cards with the same transaction as the membership change. */
  beforeMemberRemoved(tx: SpaceTransaction, spaceId: string, accountId: string): Promise<void>;
  /** Process-local abort is supplementary to committed cancellation and notification. */
  afterMemberRemoved?(scope: SpaceScope, accountId: string): Promise<void>;
  afterDeletionClaimed?(spaceId: string): Promise<void>;
  now?: () => Date;
}
export interface SpaceAuditContext {
  spaceId: string;
  actorAccountId: string;
  action: string;
  targetId?: string;
}
type AuditOutcome = "pending" | "succeeded" | "refused" | "failed";

/** Append-only intent/outcome pairs; no private arguments or member item names. */
export function createSpaceAuditWriter(db: Database) {
  async function append(
    tx: Database | SpaceTransaction,
    operationId: string,
    context: SpaceAuditContext,
    outcome: AuditOutcome,
    code?: string,
  ) {
    try {
      await tx.insert(spaceAudit).values({
        ...context,
        id: crypto.randomUUID(),
        operationId,
        outcome,
        code: code ?? null,
      });
    } catch {
      throw new SpaceMutationError("SPACE_AUDIT_UNAVAILABLE");
    }
  }
  return {
    append,
    async begin(spaceId: string, actorAccountId: string, action: string, targetId?: string) {
      const operationId = crypto.randomUUID();
      await append(
        db,
        operationId,
        { spaceId, actorAccountId, action, ...(targetId === undefined ? {} : { targetId }) },
        "pending",
      );
      return operationId;
    },
    succeed(tx: SpaceTransaction, operationId: string, context: SpaceAuditContext) {
      return append(tx, operationId, context, "succeeded");
    },
    finish(
      operationId: string,
      context: SpaceAuditContext,
      outcome: "refused" | "failed",
      code: string,
    ) {
      return append(db, operationId, context, outcome, code);
    },
  };
}
function spaceView(row: typeof spaces.$inferSelect): Space {
  return spaceSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function memberView(row: typeof spaceMembers.$inferSelect): SpaceMember {
  return spaceMemberSchema.parse({
    spaceId: row.spaceId,
    accountId: row.accountId,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  });
}
function invitationView(row: typeof spaceInvitations.$inferSelect) {
  return spaceInvitationSchema.parse({
    spaceId: row.spaceId,
    id: row.id,
    inviterAccountId: row.inviterAccountId,
    inviterName: row.inviterName,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });
}
async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function emit(
  tx: SpaceTransaction,
  spaceId: string,
  kind: typeof spaceEvents.$inferInsert.kind,
  payload: Record<string, unknown>,
) {
  const [event] = await tx.insert(spaceEvents).values({ spaceId, kind, payload }).returning();
  await tx.execute(
    sql`select pg_notify('raypx_space_events', ${JSON.stringify({ spaceId, sequence: event!.id, kind, ...(typeof payload.accountId === "string" ? { accountId: payload.accountId } : {}), ...(payload.reason === "removed" || payload.reason === "left" ? { reason: payload.reason } : {}) })})`,
  );
}
function refusal(error: unknown) {
  return error instanceof SpaceMutationError || error instanceof SpaceNotFound;
}

/** Construction is pure: all admission, audit and lifecycle work starts on a call. */
export function createSpaceManagement(db: Database, hooks: SpaceManagementHooks): SpaceManagement {
  const clock = hooks.now ?? (() => new Date());
  const writer = createSpaceAuditWriter(db);
  async function admitted(
    tx: Database | SpaceTransaction,
    scope: SpaceScope,
    owner = false,
    allowDeleting = false,
  ) {
    const [space] = await tx
      .select()
      .from(spaces)
      .where(eq(spaces.id, scope.spaceId))
      .for("update");
    if (!space || (space.deletionClaimedAt && !allowDeleting)) throw new SpaceNotFound();
    // Read admission after acquiring the serialization lock. A joined SELECT can
    // keep a pre-lock membership snapshot while waiting for another owner's edit.
    const [member] = await tx
      .select()
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, scope.spaceId),
          eq(spaceMembers.accountId, scope.member.accountId),
          isNull(spaceMembers.removedAt),
        ),
      );
    if (!member) throw new SpaceNotFound();
    if (owner && member.role !== "owner") throw new SpaceMutationError("SPACE_OWNER_REQUIRED");
    return { space, member };
  }
  async function audited<T>(
    auditContext: SpaceAuditContext,
    execute: (tx: SpaceTransaction) => Promise<T>,
  ) {
    const operationId = await writer.begin(
      auditContext.spaceId,
      auditContext.actorAccountId,
      auditContext.action,
      auditContext.targetId,
    );
    try {
      return await db.transaction(async (tx) => {
        const result = await execute(tx);
        await writer.succeed(tx, operationId, auditContext);
        return result;
      });
    } catch (error) {
      let code = "MUTATION_FAILED";
      if (error instanceof SpaceMutationError) code = error.code;
      if (error instanceof SpaceNotFound) code = "NOT_FOUND";
      await writer.finish(operationId, auditContext, refusal(error) ? "refused" : "failed", code);
      throw error;
    }
  }
  function context(scope: SpaceScope, action: string, targetId?: string): SpaceAuditContext {
    return {
      spaceId: scope.spaceId,
      actorAccountId: scope.member.accountId,
      action,
      ...(targetId === undefined ? {} : { targetId }),
    };
  }
  async function activeMembers(tx: SpaceTransaction, spaceId: string) {
    return tx
      .select()
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), isNull(spaceMembers.removedAt)))
      .orderBy(asc(spaceMembers.createdAt), asc(spaceMembers.accountId));
  }
  async function assertAnotherOwner(
    tx: SpaceTransaction,
    spaceId: string,
    target: typeof spaceMembers.$inferSelect,
  ) {
    if (target.role !== "owner") return;
    const members = await activeMembers(tx, spaceId);
    if (!members.some((member) => member.accountId !== target.accountId && member.role === "owner"))
      throw new SpaceMutationError("SPACE_LAST_OWNER");
  }
  async function remove(
    scope: SpaceScope,
    accountId: string,
    leaving: boolean,
  ): Promise<SpaceMemberRemoval> {
    const auditContext = context(scope, leaving ? "member.left" : "member.removed");
    const result = await audited(auditContext, async (tx) => {
      await admitted(tx, scope, !leaving);
      const [target] = await tx
        .select()
        .from(spaceMembers)
        .where(
          and(
            eq(spaceMembers.spaceId, scope.spaceId),
            eq(spaceMembers.accountId, accountId),
            isNull(spaceMembers.removedAt),
          ),
        );
      if (!target) throw new SpaceNotFound();
      auditContext.targetId = target.accountId;
      await assertAnotherOwner(tx, scope.spaceId, target);
      const paused = await tx
        .select({ id: routines.id, name: routines.name })
        .from(routines)
        .where(and(eq(routines.spaceId, scope.spaceId), eq(routines.ownerAccountId, accountId)))
        .orderBy(asc(routines.id));
      await tx
        .update(routines)
        .set({ enabled: false, nextDueAt: null, webhookDigest: null, updatedAt: clock() })
        .where(and(eq(routines.spaceId, scope.spaceId), eq(routines.ownerAccountId, accountId)));
      // Scheduling locks routine definitions before conversation counters.
      await hooks.beforeMemberRemoved(tx, scope.spaceId, accountId);
      // Definitions/history retain their same-Space owner row. Credentials and current
      // availability never inherit that retained identity's former authorization.
      await tx
        .delete(routineSecrets)
        .where(
          and(eq(routineSecrets.spaceId, scope.spaceId), eq(routineSecrets.accountId, accountId)),
        );
      await tx
        .delete(modelConnectionSpaces)
        .where(
          and(
            eq(modelConnectionSpaces.spaceId, scope.spaceId),
            eq(modelConnectionSpaces.accountId, accountId),
          ),
        );
      await tx
        .delete(memberSkillSpaces)
        .where(
          and(
            eq(memberSkillSpaces.spaceId, scope.spaceId),
            eq(memberSkillSpaces.accountId, accountId),
          ),
        );
      await tx
        .delete(agentMemberSkills)
        .where(
          and(
            eq(agentMemberSkills.spaceId, scope.spaceId),
            eq(agentMemberSkills.accountId, accountId),
          ),
        );
      await tx
        .delete(agentSpaceSkills)
        .where(
          and(
            eq(agentSpaceSkills.spaceId, scope.spaceId),
            eq(agentSpaceSkills.accountId, accountId),
          ),
        );
      await tx
        .delete(mcpServerSpaces)
        .where(
          and(eq(mcpServerSpaces.spaceId, scope.spaceId), eq(mcpServerSpaces.accountId, accountId)),
        );
      await tx
        .delete(agentMcpServers)
        .where(
          and(eq(agentMcpServers.spaceId, scope.spaceId), eq(agentMcpServers.accountId, accountId)),
        );
      const cancelledInvitations = await tx
        .update(spaceInvitations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(spaceInvitations.spaceId, scope.spaceId),
            eq(spaceInvitations.inviterAccountId, accountId),
            eq(spaceInvitations.status, "open"),
          ),
        )
        .returning({ id: spaceInvitations.id });
      for (const invitation of cancelledInvitations)
        await writer.append(
          tx,
          crypto.randomUUID(),
          context(scope, "invitation.cancelled", invitation.id),
          "succeeded",
        );
      await tx
        .update(spaceMembers)
        .set({ removedAt: clock(), removalReason: leaving ? "left" : "removed" })
        .where(and(eq(spaceMembers.spaceId, scope.spaceId), eq(spaceMembers.accountId, accountId)));
      await emit(tx, scope.spaceId, "space.member.removed", {
        accountId,
        reason: leaving ? "left" : "removed",
      });
      return { accountId, pausedRoutines: paused };
    });
    await hooks.afterMemberRemoved?.(scope, accountId);
    return result;
  }
  async function settingsView(
    tx: Database | SpaceTransaction,
    spaceId: SpaceId,
  ): Promise<SpaceSettings> {
    const [row] = await tx
      .select()
      .from(spaceSettingsOverrides)
      .where(eq(spaceSettingsOverrides.spaceId, spaceId));
    return {
      spaceId,
      approvalMode: row?.approvalMode ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }
  async function cancel(scope: SpaceScope, id?: string) {
    const auditContext = context(
      scope,
      id === undefined ? "invitations.cancelled" : "invitation.cancelled",
    );
    return audited(auditContext, async (tx) => {
      await admitted(tx, scope, true);
      await expireOpen(tx, scope);
      if (id !== undefined) {
        const [existing] = await tx
          .select({ id: spaceInvitations.id })
          .from(spaceInvitations)
          .where(and(eq(spaceInvitations.spaceId, scope.spaceId), eq(spaceInvitations.id, id)));
        if (!existing) throw new SpaceNotFound();
        auditContext.targetId = existing.id;
      }
      const rows = await tx
        .update(spaceInvitations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(spaceInvitations.spaceId, scope.spaceId),
            eq(spaceInvitations.status, "open"),
            id === undefined ? undefined : eq(spaceInvitations.id, id),
          ),
        )
        .returning({ id: spaceInvitations.id });
      if (id === undefined)
        for (const invitation of rows)
          await writer.append(
            tx,
            crypto.randomUUID(),
            context(scope, "invitation.cancelled", invitation.id),
            "succeeded",
          );
      return { cancelled: rows.length };
    });
  }
  async function expireOpen(tx: SpaceTransaction, scope: SpaceScope) {
    const expired = await tx
      .update(spaceInvitations)
      .set({ status: "expired" })
      .where(
        and(
          eq(spaceInvitations.spaceId, scope.spaceId),
          eq(spaceInvitations.status, "open"),
          lte(spaceInvitations.expiresAt, clock()),
        ),
      )
      .returning({ id: spaceInvitations.id });
    for (const invitation of expired)
      await writer.append(
        tx,
        crypto.randomUUID(),
        context(scope, "invitation.expired", invitation.id),
        "succeeded",
      );
  }
  async function invitationCall<T>(
    accountId: string,
    token: string,
    action: string,
    execute: (
      tx: SpaceTransaction,
      invitation: typeof spaceInvitations.$inferSelect,
      space: typeof spaces.$inferSelect,
      alreadyMember: typeof spaceMembers.$inferSelect | undefined,
    ) => Promise<T>,
  ) {
    const hash = await tokenHash(token);
    const [found] = await db
      .select({ spaceId: spaceInvitations.spaceId, id: spaceInvitations.id })
      .from(spaceInvitations)
      .where(eq(spaceInvitations.tokenHash, hash));
    if (!found) throw new SpaceMutationError("INVITATION_NOT_FOUND");
    const auditContext = {
      spaceId: found.spaceId,
      actorAccountId: accountId,
      action,
      targetId: found.id,
    };
    const operationId = await writer.begin(found.spaceId, accountId, action, found.id);
    let committedRefusal = false;
    try {
      const result = await db.transaction(async (tx) => {
        const [space] = await tx
          .select()
          .from(spaces)
          .where(eq(spaces.id, found.spaceId))
          .for("update");
        if (!space || space.deletionClaimedAt) throw new SpaceNotFound();
        const [invitation] = await tx
          .select()
          .from(spaceInvitations)
          .where(
            and(eq(spaceInvitations.spaceId, found.spaceId), eq(spaceInvitations.id, found.id)),
          )
          .for("update");
        if (!invitation) throw new SpaceMutationError("INVITATION_NOT_FOUND");
        const [existing] = await tx
          .select()
          .from(spaceMembers)
          .where(
            and(
              eq(spaceMembers.spaceId, found.spaceId),
              eq(spaceMembers.accountId, accountId),
              isNull(spaceMembers.removedAt),
            ),
          );
        const status =
          invitation.status === "open" && invitation.expiresAt.getTime() <= clock().getTime()
            ? "expired"
            : invitation.status;
        if (status !== invitation.status) {
          await tx
            .update(spaceInvitations)
            .set({ status })
            .where(
              and(eq(spaceInvitations.spaceId, found.spaceId), eq(spaceInvitations.id, found.id)),
            );
          await writer.append(
            tx,
            crypto.randomUUID(),
            { ...auditContext, action: "invitation.expired" },
            "succeeded",
          );
        }
        // Retrying an accepted link from a current member is harmless; it neither
        // consumes another invitation nor elevates the existing membership.
        if (status !== "open" && !(existing && action === "invitation.accepted")) {
          const codes = {
            expired: "INVITATION_EXPIRED",
            cancelled: "INVITATION_CANCELLED",
            consumed: "INVITATION_CONSUMED",
          } as const;
          const code = codes[status];
          await writer.append(tx, operationId, auditContext, "refused", code);
          return { error: new SpaceMutationError(code) };
        }
        const value = await execute(tx, invitation, space, existing);
        await writer.succeed(tx, operationId, auditContext);
        return { value };
      });
      if ("error" in result) {
        committedRefusal = true;
        throw result.error;
      }
      return result.value;
    } catch (error) {
      if (!committedRefusal)
        await writer.finish(
          operationId,
          auditContext,
          refusal(error) ? "refused" : "failed",
          error instanceof SpaceMutationError ? error.code : "MUTATION_FAILED",
        );
      throw error;
    }
  }
  return {
    async get(scope) {
      return db.transaction(async (tx) => spaceView((await admitted(tx, scope)).space));
    },
    rename(scope, input) {
      return audited(context(scope, "space.renamed", scope.spaceId), async (tx) => {
        await admitted(tx, scope, true);
        const [row] = await tx
          .update(spaces)
          .set({ ...spaceInputSchema.parse(input), updatedAt: clock() })
          .where(eq(spaces.id, scope.spaceId))
          .returning();
        await emit(tx, scope.spaceId, "space.renamed", { name: row!.name });
        return spaceView(row!);
      });
    },
    async delete(scope) {
      const result = await audited(
        context(scope, "space.deletion_claimed", scope.spaceId),
        async (tx) => {
          const { space } = await admitted(tx, scope, true, true);
          if (!space.deletionClaimedAt) {
            // Serialize claims by this account, including claims for different Spaces.
            await tx
              .select({ id: user.id })
              .from(user)
              .where(eq(user.id, scope.member.accountId))
              .for("update");
            const alternatives = await tx
              .select({ id: spaces.id })
              .from(spaces)
              .innerJoin(spaceMembers, eq(spaceMembers.spaceId, spaces.id))
              .where(
                and(
                  eq(spaceMembers.accountId, scope.member.accountId),
                  eq(spaceMembers.role, "owner"),
                  isNull(spaceMembers.removedAt),
                  isNull(spaces.deletionClaimedAt),
                  sql`${spaces.id} <> ${scope.spaceId}`,
                  sql`not exists (select 1 from ${spaceMembers} other_member where other_member.space_id = ${spaces.id} and other_member.account_id <> ${scope.member.accountId} and other_member.removed_at is null)`,
                ),
              )
              .orderBy(asc(spaces.id));
            const members = await activeMembers(tx, scope.spaceId);
            if (members.length === 1 && alternatives.length === 0)
              throw new SpaceMutationError("SPACE_LAST_PRIVATE");
            const claimedAt = clock();
            await tx
              .update(spaces)
              .set({ deletionClaimedAt: claimedAt })
              .where(eq(spaces.id, scope.spaceId));
            await tx.insert(spaceDeletionJobs).values({
              spaceId: scope.spaceId,
              requestedByAccountId: scope.member.accountId,
              claimedAt,
              updatedAt: claimedAt,
            });
            await tx.execute(
              sql`select pg_notify('raypx_space_events', ${JSON.stringify({ spaceId: scope.spaceId, sequence: 0, kind: "space.deleted" })})`,
            );
          }
          return { spaceId: scope.spaceId, status: "deleting" as const };
        },
      );
      await hooks.afterDeletionClaimed?.(scope.spaceId);
      return result;
    },
    leave(scope) {
      return remove(scope, scope.member.accountId, true);
    },
    removeMember(scope, accountId) {
      return remove(scope, accountId, false);
    },
    async members(scope) {
      return db.transaction(async (tx) => {
        const { member } = await admitted(tx, scope);
        const rows = await tx
          .select({ member: spaceMembers, name: user.name, image: user.image, email: user.email })
          .from(spaceMembers)
          .innerJoin(user, eq(user.id, spaceMembers.accountId))
          .where(and(eq(spaceMembers.spaceId, scope.spaceId), isNull(spaceMembers.removedAt)))
          .orderBy(asc(spaceMembers.createdAt), asc(spaceMembers.accountId));
        return rows.map((row) => ({
          ...memberView(row.member),
          name: row.name,
          image: row.image,
          ...(member.role === "owner" ? { email: row.email } : {}),
        }));
      });
    },
    updateMemberRole(scope, accountId, role) {
      const auditContext = context(scope, "member.role_changed");
      return audited(auditContext, async (tx) => {
        await admitted(tx, scope, true);
        const [target] = await tx
          .select()
          .from(spaceMembers)
          .where(
            and(
              eq(spaceMembers.spaceId, scope.spaceId),
              eq(spaceMembers.accountId, accountId),
              isNull(spaceMembers.removedAt),
            ),
          );
        if (!target) throw new SpaceNotFound();
        auditContext.targetId = target.accountId;
        if (role === "member") await assertAnotherOwner(tx, scope.spaceId, target);
        const [row] = await tx
          .update(spaceMembers)
          .set({ role })
          .where(
            and(eq(spaceMembers.spaceId, scope.spaceId), eq(spaceMembers.accountId, accountId)),
          )
          .returning();
        await emit(tx, scope.spaceId, "space.member.role_changed", { accountId, role });
        return memberView(row!);
      });
    },
    async invitations(scope) {
      return db.transaction(async (tx) => {
        await admitted(tx, scope, true);
        await expireOpen(tx, scope);
        const rows = await tx
          .select()
          .from(spaceInvitations)
          .where(
            and(eq(spaceInvitations.spaceId, scope.spaceId), eq(spaceInvitations.status, "open")),
          )
          .orderBy(asc(spaceInvitations.createdAt), asc(spaceInvitations.id));
        return rows.map(invitationView);
      });
    },
    createInvitation(scope) {
      const id = crypto.randomUUID();
      return audited(context(scope, "invitation.created", id), async (tx) => {
        await admitted(tx, scope, true);
        const [account] = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, scope.member.accountId));
        if (!account) throw new SpaceNotFound();
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        const createdAt = clock();
        const [row] = await tx
          .insert(spaceInvitations)
          .values({
            spaceId: scope.spaceId,
            id,
            tokenHash: await tokenHash(token),
            inviterAccountId: scope.member.accountId,
            inviterName: account.name,
            createdAt,
            expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
          })
          .returning();
        return { ...invitationView(row!), token };
      });
    },
    cancelInvitation(scope, id) {
      return cancel(scope, id);
    },
    cancelInvitations(scope) {
      return cancel(scope);
    },
    previewInvitation(accountId, token) {
      return invitationCall(
        accountId,
        token,
        "invitation.previewed",
        async (_tx, invitation, space, existing) => ({
          spaceId: spaceView(space).id,
          spaceName: space.name,
          inviterName: invitation.inviterName,
          expiresAt: invitation.expiresAt.toISOString(),
          alreadyMember: Boolean(existing),
          shares: ["agents", "conversations", "memory", "routines", "team_computer", "pages"],
        }),
      );
    },
    acceptInvitation(accountId, token) {
      return invitationCall(
        accountId,
        token,
        "invitation.accepted",
        async (tx, invitation, space, existing) => {
          if (existing)
            return { space: spaceView(space), member: memberView(existing), joined: false };
          const [member] = await tx
            .insert(spaceMembers)
            .values({ spaceId: space.id, accountId, role: "member", createdAt: clock() })
            .onConflictDoUpdate({
              target: [spaceMembers.spaceId, spaceMembers.accountId],
              set: { role: "member", removedAt: null, removalReason: null, createdAt: clock() },
            })
            .returning();
          await tx
            .update(spaceInvitations)
            .set({ status: "consumed", consumedByAccountId: accountId, consumedAt: clock() })
            .where(
              and(eq(spaceInvitations.spaceId, space.id), eq(spaceInvitations.id, invitation.id)),
            );
          await emit(tx, space.id, "space.member.joined", { accountId });
          await writer.append(
            tx,
            crypto.randomUUID(),
            {
              spaceId: space.id,
              actorAccountId: accountId,
              action: "member.joined",
              targetId: accountId,
            },
            "succeeded",
          );
          return { space: spaceView(space), member: memberView(member!), joined: true };
        },
      );
    },
    async settings(scope) {
      return db.transaction(async (tx) => {
        await admitted(tx, scope, true);
        return settingsView(tx, scope.spaceId);
      });
    },
    setApprovalOverride(scope, mode) {
      return audited(
        context(scope, "settings.approval_override_set", scope.spaceId),
        async (tx) => {
          await admitted(tx, scope, true);
          if (mode === "auto" && !(await hooks.reviewModelAvailable?.()))
            throw new SpaceMutationError("REVIEW_MODEL_NOT_CONFIGURED");
          const values = {
            spaceId: scope.spaceId,
            approvalMode: mode,
            updatedByAccountId: scope.member.accountId,
            updatedAt: clock(),
          };
          await tx
            .insert(spaceSettingsOverrides)
            .values(values)
            .onConflictDoUpdate({ target: spaceSettingsOverrides.spaceId, set: values });
          return settingsView(tx, scope.spaceId);
        },
      );
    },
    clearApprovalOverride(scope) {
      return audited(
        context(scope, "settings.approval_override_cleared", scope.spaceId),
        async (tx) => {
          await admitted(tx, scope, true);
          await tx
            .delete(spaceSettingsOverrides)
            .where(eq(spaceSettingsOverrides.spaceId, scope.spaceId));
          return settingsView(tx, scope.spaceId);
        },
      );
    },
    async audit(scope, cursor, limit) {
      return db.transaction(async (tx) => {
        await admitted(tx, scope, true);
        let position: { createdAt: Date; id: string } | undefined;
        if (cursor !== undefined) {
          const [row] = await tx
            .select({ createdAt: spaceAudit.createdAt, id: spaceAudit.id })
            .from(spaceAudit)
            .where(and(eq(spaceAudit.spaceId, scope.spaceId), eq(spaceAudit.id, cursor)));
          if (!row) throw new SpaceMutationError("INVALID_AUDIT_CURSOR");
          position = row;
        }
        const size = Math.max(1, Math.min(100, limit));
        const rows = await tx
          .select()
          .from(spaceAudit)
          .where(
            and(
              eq(spaceAudit.spaceId, scope.spaceId),
              position
                ? or(
                    lt(spaceAudit.createdAt, position.createdAt),
                    and(
                      eq(spaceAudit.createdAt, position.createdAt),
                      lt(spaceAudit.id, position.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(spaceAudit.createdAt), desc(spaceAudit.id))
          .limit(size + 1);
        const items = rows
          .slice(0, size)
          .map((row) =>
            spaceAuditEntrySchema.parse({ ...row, createdAt: row.createdAt.toISOString() }),
          );
        return { items, nextCursor: rows.length > size ? items.at(-1)!.id : null };
      });
    },
    async events(scope, after, limit) {
      return db.transaction(async (tx) => {
        await admitted(tx, scope);
        const rows = await tx
          .select()
          .from(spaceEvents)
          .where(and(eq(spaceEvents.spaceId, scope.spaceId), gt(spaceEvents.id, after)))
          .orderBy(asc(spaceEvents.id))
          .limit(Math.max(1, Math.min(1000, limit)));
        return rows.map((row) =>
          spaceEventSchema.parse({
            id: row.id,
            spaceId: row.spaceId,
            kind: row.kind,
            payload: row.payload,
            createdAt: row.createdAt.toISOString(),
          }),
        );
      });
    },
  };
}
