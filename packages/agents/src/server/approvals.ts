import { and, asc, desc, eq, gt, inArray, isNull, isNotNull, lte, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  approvalSettings as settings,
  approvalRules as rules,
  approvalRequests as requests,
  conversationEffects as effects,
  conversationCounters as counters,
  conversationEvents as events,
  conversationRuns as runs,
  conversations,
  spaces,
  spaceMembers,
  spaceSettingsOverrides,
} from "@raypx/database/schema";
import {
  approvalRequestSchema,
  approvalReviewSchema,
  revisionedApprovalSettingsSchema,
  effectSchema,
  type ApprovalRequest,
  type ApprovalState,
} from "@raypx/core/approvals";
import type { ConversationId } from "@raypx/core/agents";
import type { Run, RunId } from "@raypx/core/conversation";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAuditWriter } from "@raypx/spaces/server/postgres";
import {
  ApprovalOperationError,
  ApprovalSettingsConflictError,
  EffectUnknownError,
  EffectInProgressError,
  type ApprovalsRepository,
} from "../approvals.js";
import { publishConversationNotice } from "./notice.js";
import { EFFECT_INTENT_TIMEOUT_MS } from "../tool-limits.js";
import { StaleRunFenceError, type ExecutionRun } from "../conversations.js";
import { assertRunFence } from "./fence.js";
import { finishToolEvent } from "./tool-events.js";
import { toolCompletion } from "../tool-lifecycle.js";

type Transaction = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;
async function settingsView(tx: Transaction, row: typeof settings.$inferSelect) {
  const items = await tx
    .select({
      toolName: rules.toolName,
      executable: rules.executable,
      decision: rules.decision,
    })
    .from(rules)
    .where(eq(rules.accountId, row.accountId))
    .orderBy(asc(rules.toolName), asc(rules.executable));
  return revisionedApprovalSettingsSchema.parse({
    mode: row.mode,
    rules: items,
    revision: row.revision,
  });
}
function requestView(row: typeof requests.$inferSelect): ApprovalRequest {
  const {
    fence: _fence,
    review: _review,
    reviewModelId: _model,
    reviewStartedAt: _started,
    reviewFence: _reviewFence,
    reviewEffectKey: _effectKey,
    device,
    ...request
  } = row;
  return approvalRequestSchema.parse({
    ...request,
    ...(device ? { device } : {}),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    ...(row.review ? { review: approvalReviewSchema.parse(row.review) } : {}),
  });
}
function effectView(row: typeof effects.$inferSelect) {
  const { fence: _fence, approvalRequestId: _approval, ...effect } = row;
  return effectSchema.parse({
    ...effect,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
}
/** Cards deliberately omit the exact arguments, including file contents. */
function approvalCardData(request: ApprovalRequest) {
  return {
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    argumentSummary: request.argumentSummary,
    target: request.target,
    ...(request.device ? { device: request.device } : {}),
    memberAccountId: request.memberAccountId,
    expiresAt: request.expiresAt,
  };
}
export function createApprovalsRepository(
  db: Database,
  publish = publishConversationNotice,
  audit = createSpaceAuditWriter(db),
): ApprovalsRepository {
  async function activeSpace(tx: Transaction, spaceId: string) {
    // Management claims the Space before touching conversation counters. Follow
    // the same order so member removal cannot deadlock with an approval answer.
    const [space] = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, spaceId), isNull(spaces.deletionClaimedAt)))
      .for("share");
    if (!space) throw new SpaceNotFound();
  }
  const requestSelection = (scope: SpaceScope, id: string) =>
    and(eq(requests.spaceId, scope.spaceId), eq(requests.id, id));
  const counterSelection = (scope: SpaceScope, id: ConversationId) =>
    and(eq(counters.spaceId, scope.spaceId), eq(counters.conversationId, id));
  async function lock(tx: Transaction, scope: SpaceScope, conversationId: ConversationId) {
    const [conversation] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.spaceId, scope.spaceId), eq(conversations.id, conversationId)));
    if (!conversation) throw new SpaceNotFound();
    await tx
      .insert(counters)
      .values({ spaceId: scope.spaceId, conversationId })
      .onConflictDoNothing();
    const [counter] = await tx
      .select()
      .from(counters)
      .where(counterSelection(scope, conversationId))
      .for("update");
    return counter!;
  }
  async function requireRun(tx: Pick<Database, "select">, scope: SpaceScope, runId: RunId) {
    const [run] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.id, runId)));
    if (!run) throw new SpaceNotFound();
    return run;
  }
  async function lockObservedRun(tx: Transaction, scope: SpaceScope, runId: RunId) {
    const selected = await requireRun(tx, scope, runId);
    const conversationId = selected.conversationId as ConversationId;
    // Member reads can observe abandoned or unclaimed work. Serialize their
    // monotonic expiry with attempt writes without requiring a live lease.
    await lock(tx, scope, conversationId);
    const [current] = await tx
      .select({ fence: runs.fence })
      .from(runs)
      .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.id, runId)))
      .for("update");
    if (!current) throw new SpaceNotFound();
    return { id: runId, conversationId, fence: current.fence };
  }
  async function expireIntents(
    tx: Transaction,
    scope: SpaceScope,
    runId: RunId,
    now: Date,
    observer: Pick<ExecutionRun, "id" | "conversationId" | "fence">,
  ) {
    const expired = await tx
      .update(effects)
      .set({ state: "unknown" })
      .where(
        and(
          eq(effects.spaceId, scope.spaceId),
          eq(effects.runId, runId),
          eq(effects.state, "intent"),
          lte(effects.createdAt, new Date(now.getTime() - EFFECT_INTENT_TIMEOUT_MS)),
        ),
      )
      .returning({ toolCallId: effects.toolCallId });
    expired.sort((a, b) => a.toolCallId.localeCompare(b.toolCallId));
    for (const effect of expired)
      await finishToolEvent(
        tx,
        scope,
        observer,
        toolCompletion(effect.toolCallId, null),
        publish,
        now,
      );
  }
  async function findRequest(tx: Pick<Database, "select">, scope: SpaceScope, id: string) {
    const [row] = await tx.select().from(requests).where(requestSelection(scope, id));
    if (!row) throw new ApprovalOperationError("NOT_FOUND");
    return requestView(row);
  }
  async function appendCard(
    tx: Transaction,
    scope: SpaceScope,
    request: ApprovalRequest,
    sequence: number,
    kind: "card.created" | "card.resolved",
    fence = 0,
  ) {
    const data =
      kind === "card.created"
        ? approvalCardData(request)
        : {
            ...approvalCardData(request),
            outcome: request.state,
            answeredByAccountId: request.answeredByAccountId,
            ...(request.review ? { review: request.review } : {}),
          };
    await tx.insert(events).values({
      spaceId: scope.spaceId,
      conversationId: request.conversationId,
      sequence,
      kind,
      fence,
      runId: request.runId,
      requestId: request.id,
      data,
    });
  }
  async function finishEvents(
    tx: Transaction,
    scope: SpaceScope,
    conversationId: ConversationId,
    sequence: number,
  ) {
    await tx.update(counters).set({ sequence }).where(counterSelection(scope, conversationId));
    await publish(tx, { conversationId, sequence });
  }
  async function appendRunState(
    tx: Transaction,
    scope: SpaceScope,
    request: ApprovalRequest,
    state: "running" | "waiting",
    sequence: number,
    fence = 0,
  ) {
    await tx.insert(events).values({
      spaceId: scope.spaceId,
      conversationId: request.conversationId,
      sequence,
      kind: "run.state",
      fence,
      runId: request.runId,
      data: { state, failureCode: null, computerInputPaused: false },
    });
  }
  async function resolveRequest(
    tx: Transaction,
    scope: SpaceScope,
    current: ApprovalRequest,
    state: Exclude<ApprovalState, "pending">,
    answeredByAccountId: string | null,
    now: Date,
    sequence: number,
    fence = 0,
  ) {
    const [row] = await tx
      .update(requests)
      .set({ state, resolvedAt: now, answeredByAccountId })
      .where(and(requestSelection(scope, current.id), eq(requests.state, "pending")))
      .returning();
    if (!row) return current;
    const request = requestView(row);
    await appendCard(tx, scope, request, sequence, "card.resolved", fence);
    // Stop changes the Run first; this conditional transition cannot revive it.
    const [resumed] = await tx
      .update(runs)
      .set({ state: "running", computerInputPaused: false })
      .where(
        and(
          eq(runs.spaceId, scope.spaceId),
          eq(runs.conversationId, request.conversationId),
          eq(runs.id, request.runId),
          eq(runs.state, "waiting"),
        ),
      )
      .returning({ id: runs.id });
    if (resumed) {
      sequence++;
      await appendRunState(tx, scope, request, "running", sequence, fence);
    }
    await finishEvents(tx, scope, request.conversationId, sequence);
    return request;
  }
  async function poll(
    scope: SpaceScope,
    run: Pick<Run, "id" | "memberAccountId">,
    id: string,
    now: Date,
    cancel = false,
    execution?: ExecutionRun,
  ) {
    return db.transaction(async (tx) => {
      const before = await findRequest(tx, scope, id);
      const counter = await lock(tx, scope, before.conversationId);
      if (execution) await assertRunFence(tx, scope, execution);
      const current = await findRequest(tx, scope, id);
      if (current.runId !== run.id || current.memberAccountId !== run.memberAccountId)
        throw new ApprovalOperationError("NOT_FOUND");
      if (current.state !== "pending") return current;
      if (cancel)
        return resolveRequest(
          tx,
          scope,
          current,
          "cancelled",
          null,
          now,
          counter.sequence + 1,
          execution?.fence,
        );
      if (Date.parse(current.expiresAt) <= now.getTime())
        return resolveRequest(
          tx,
          scope,
          current,
          "expired",
          null,
          now,
          counter.sequence + 1,
          execution?.fence,
        );
      return current;
    });
  }
  return {
    async getEffectiveMode(scope, defaultMode) {
      return db.transaction(async (tx) => {
        await activeSpace(tx, scope.spaceId);
        const [member] = await tx
          .select({ accountId: spaceMembers.accountId })
          .from(spaceMembers)
          .where(
            and(
              eq(spaceMembers.spaceId, scope.spaceId),
              eq(spaceMembers.accountId, scope.member.accountId),
              isNull(spaceMembers.removedAt),
            ),
          )
          .for("share");
        if (!member) throw new SpaceNotFound();
        const [override] = await tx
          .select({ mode: spaceSettingsOverrides.approvalMode })
          .from(spaceSettingsOverrides)
          .where(eq(spaceSettingsOverrides.spaceId, scope.spaceId));
        if (override) return { mode: override.mode, source: "space_override" as const };
        const [account] = await tx
          .select({ mode: settings.mode })
          .from(settings)
          .where(eq(settings.accountId, scope.member.accountId));
        return { mode: account?.mode ?? defaultMode, source: "account_default" as const };
      });
    },
    async getSettings(accountId, defaultMode) {
      return db.transaction(async (tx) => {
        await tx.insert(settings).values({ accountId, mode: defaultMode }).onConflictDoNothing();
        const [row] = await tx
          .select()
          .from(settings)
          .where(eq(settings.accountId, accountId))
          .for("share");
        return settingsView(tx, row!);
      });
    },
    async getRunSettings(scope, actorAccountId, defaultMode) {
      return db.transaction(async (tx) => {
        await activeSpace(tx, scope.spaceId);
        // Run policy follows its historical actor, never the member waking it.
        // Current membership still gates access to that actor's private rules.
        const [member] = await tx
          .select({ accountId: spaceMembers.accountId })
          .from(spaceMembers)
          .where(
            and(
              eq(spaceMembers.spaceId, scope.spaceId),
              eq(spaceMembers.accountId, actorAccountId),
              isNull(spaceMembers.removedAt),
            ),
          )
          .for("share");
        if (!member) throw new SpaceNotFound();
        await tx
          .insert(settings)
          .values({ accountId: actorAccountId, mode: defaultMode })
          .onConflictDoNothing();
        const [account] = await tx
          .select()
          .from(settings)
          .where(eq(settings.accountId, actorAccountId))
          .for("share");
        const [override] = await tx
          .select({ mode: spaceSettingsOverrides.approvalMode })
          .from(spaceSettingsOverrides)
          .where(eq(spaceSettingsOverrides.spaceId, scope.spaceId));
        const value = await settingsView(tx, account!);
        return { ...value, mode: override?.mode ?? value.mode };
      });
    },
    async updateSettings(accountId, input, expectedRevision, defaultMode) {
      return db.transaction(async (tx) => {
        await tx.insert(settings).values({ accountId, mode: defaultMode }).onConflictDoNothing();
        const [current] = await tx
          .select()
          .from(settings)
          .where(eq(settings.accountId, accountId))
          .for("update");
        if (current!.revision !== expectedRevision)
          throw new ApprovalSettingsConflictError(await settingsView(tx, current!));
        await tx
          .update(settings)
          .set({ mode: input.mode, revision: current!.revision + 1, updatedAt: new Date() })
          .where(eq(settings.accountId, accountId));
        await tx.delete(rules).where(eq(rules.accountId, accountId));
        // Block wins if a caller supplied the same exact action more than once.
        const unique = new Map<string, (typeof input.rules)[number]>();
        for (const rule of input.rules) {
          const key = JSON.stringify([rule.toolName, rule.executable]);
          if (unique.get(key)?.decision !== "block") unique.set(key, rule);
        }
        if (unique.size)
          await tx
            .insert(rules)
            .values([...unique.values()].map((rule) => ({ ...rule, accountId })));
        return settingsView(tx, { ...current!, mode: input.mode, revision: current!.revision + 1 });
      });
    },
    async listPending(scope, now) {
      const expired = await db
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.spaceId, scope.spaceId),
            eq(requests.memberAccountId, scope.member.accountId),
            eq(requests.state, "pending"),
            lte(requests.expiresAt, now),
          ),
        )
        .orderBy(asc(requests.expiresAt), asc(requests.id))
        .limit(100);
      for (const row of expired)
        await poll(
          scope,
          { id: row.runId as RunId, memberAccountId: row.memberAccountId },
          row.id,
          now,
        );
      const rows = await db
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.spaceId, scope.spaceId),
            eq(requests.memberAccountId, scope.member.accountId),
            eq(requests.state, "pending"),
            gt(requests.expiresAt, now),
          ),
        )
        .orderBy(asc(requests.createdAt), asc(requests.id))
        .limit(100);
      return rows.map(requestView);
    },
    async answer(scope, id, answer, now) {
      const context: import("@raypx/spaces/server/postgres").SpaceAuditContext = {
        spaceId: scope.spaceId,
        actorAccountId: scope.member.accountId,
        action: "approval.answered",
      };
      // A durable intent precedes any decision. Terminal evidence is appended,
      // never rewritten, and success shares the decision's transaction.
      const operationId = await audit.begin(
        context.spaceId,
        context.actorAccountId,
        context.action,
        context.targetId,
      );
      let result: { expired: boolean; request: ApprovalRequest };
      try {
        result = await db.transaction(async (tx) => {
          await activeSpace(tx, scope.spaceId);
          // Historical requests survive revocation; the answering member must still
          // exist now. Hold the membership through the decision transaction.
          const [member] = await tx
            .select({ accountId: spaceMembers.accountId })
            .from(spaceMembers)
            .where(
              and(
                eq(spaceMembers.spaceId, scope.spaceId),
                eq(spaceMembers.accountId, scope.member.accountId),
                isNull(spaceMembers.removedAt),
              ),
            )
            .for("share");
          if (!member) throw new SpaceNotFound();
          const before = await findRequest(tx, scope, id);
          context.targetId = before.id;
          if (before.memberAccountId !== scope.member.accountId)
            throw new ApprovalOperationError("NOT_ADDRESSED");
          const counter = await lock(tx, scope, before.conversationId);
          const current = await findRequest(tx, scope, id);
          if (current.state !== "pending") throw new ApprovalOperationError("ALREADY_RESOLVED");
          if (Date.parse(current.expiresAt) <= now.getTime()) {
            const request = await resolveRequest(
              tx,
              scope,
              current,
              "expired",
              null,
              now,
              counter.sequence + 1,
            );
            // The lazy expiry and its refusal must survive the API error together.
            await audit.append(tx, operationId, context, "refused", "EXPIRED");
            return { expired: true, request };
          }
          if (answer.decision === "approved" && answer.allowTool) {
            await tx
              .insert(settings)
              .values({ accountId: scope.member.accountId, mode: "ask" })
              .onConflictDoNothing();
            await tx
              .select()
              .from(settings)
              .where(eq(settings.accountId, scope.member.accountId))
              .for("update");
            const executable =
              current.toolName === "computer_run_command" &&
              typeof current.arguments.executable === "string"
                ? current.arguments.executable
                : null;
            const existingRules = await tx
              .select()
              .from(rules)
              .where(eq(rules.accountId, scope.member.accountId));
            if (
              existingRules.length >= 256 &&
              !existingRules.some(
                (rule) => rule.toolName === current.toolName && rule.executable === executable,
              )
            )
              throw new ApprovalOperationError("RULE_LIMIT");
            const inserted = await tx
              .insert(rules)
              .values({
                accountId: scope.member.accountId,
                toolName: current.toolName,
                executable,
                decision: "allow",
              })
              .onConflictDoNothing()
              .returning({ accountId: rules.accountId });
            if (inserted.length)
              await tx
                .update(settings)
                .set({ revision: sql`${settings.revision} + 1`, updatedAt: now })
                .where(eq(settings.accountId, scope.member.accountId));
          }
          const request = await resolveRequest(
            tx,
            scope,
            current,
            answer.decision,
            scope.member.accountId,
            now,
            counter.sequence + 1,
          );
          await audit.succeed(tx, operationId, context);
          return { expired: false, request };
        });
      } catch (error) {
        const refused = error instanceof ApprovalOperationError || error instanceof SpaceNotFound;
        let code = "WRITE_FAILED";
        if (error instanceof ApprovalOperationError) code = error.code;
        if (error instanceof SpaceNotFound) code = "NOT_FOUND";
        await audit.finish(operationId, context, refused ? "refused" : "failed", code);
        throw error;
      }
      if (result.expired) throw new ApprovalOperationError("EXPIRED");
      return result.request;
    },
    async createRequest(scope, run, call, expiresAt, createdAt) {
      return db.transaction(async (tx) => {
        const counter = await lock(tx, scope, run.conversationId);
        const active = await assertRunFence(tx, scope, run);
        if (
          active.conversationId !== run.conversationId ||
          active.memberAccountId !== run.memberAccountId
        )
          throw new ApprovalOperationError("NOT_FOUND");
        run.untrustedInput ||= active.untrustedInput || active.inboundProvenance !== null;
        run.instructionRevision = active.instructionRevision;
        const requireMember =
          run.untrustedInput || call.argumentsUntrusted || active.instructionRevision > 0;
        const existingRequests = await tx
          .select()
          .from(requests)
          .where(
            and(
              eq(requests.spaceId, scope.spaceId),
              eq(requests.conversationId, run.conversationId),
              eq(requests.runId, run.id),
              eq(requests.toolCallId, call.id),
              eq(requests.toolName, call.name),
              eq(requests.arguments, call.arguments),
            ),
          )
          .orderBy(asc(requests.createdAt), asc(requests.id))
          .limit(512);
        const existing = existingRequests.find(
          (candidate) =>
            !(
              requireMember &&
              candidate.state === "approved" &&
              candidate.answeredByAccountId === null &&
              candidate.review?.verdict === "approve"
            ),
        );
        if (existing) return requestView(existing);
        const invalidated = existingRequests.find(
          (candidate) => requireMember && candidate.review?.verdict === "approve",
        );
        const fallback = invalidated?.review
          ? approvalReviewSchema.parse({
              ...invalidated.review,
              verdict: "ask",
              reason: "Changed authority requires a member decision.",
              completedAt: createdAt.toISOString(),
              durationMs: Math.max(
                0,
                createdAt.getTime() - Date.parse(String(invalidated.review.startedAt)),
              ),
              fence: run.fence,
            })
          : undefined;
        if (active.state !== "running") throw new ApprovalOperationError("ALREADY_RESOLVED");
        const [row] = await tx
          .insert(requests)
          .values({
            spaceId: scope.spaceId,
            conversationId: run.conversationId,
            fence: run.fence,
            id: crypto.randomUUID(),
            runId: run.id,
            memberAccountId: run.memberAccountId,
            toolCallId: call.id,
            toolName: call.name,
            arguments: call.arguments,
            argumentSummary: call.argumentSummary,
            target: call.target,
            device: call.device
              ? {
                  id: call.device.id,
                  name: call.device.name,
                  directory: call.device.directory,
                  ...(call.device.command !== undefined ? { command: call.device.command } : {}),
                }
              : null,
            expiresAt,
            createdAt,
            ...(fallback
              ? {
                  review: fallback,
                  reviewStartedAt: new Date(fallback.startedAt),
                  reviewModelId: fallback.modelId,
                  reviewFence: run.fence,
                  reviewEffectKey: invalidated!.reviewEffectKey,
                }
              : {}),
          })
          .returning();
        const request = requestView(row!);
        await tx
          .update(runs)
          .set({ state: "waiting", computerInputPaused: false })
          .where(
            and(
              eq(runs.spaceId, scope.spaceId),
              eq(runs.conversationId, run.conversationId),
              eq(runs.id, run.id),
            ),
          );
        await appendCard(tx, scope, request, counter.sequence + 1, "card.created", run.fence);
        await appendRunState(tx, scope, request, "waiting", counter.sequence + 2, run.fence);
        await finishEvents(tx, scope, run.conversationId, counter.sequence + 2);
        return request;
      });
    },
    pollRequest: (scope, run, id, now) => poll(scope, run, id, now, false, run),
    async cancelRequest(scope, run, id, now) {
      await poll(scope, run, id, now, true, run);
    },
    async claimReview(scope, run, id, modelId, effectKey, budget, now) {
      return db.transaction(async (tx) => {
        await lock(tx, scope, run.conversationId);
        await assertRunFence(tx, scope, run);
        const [current] = await tx.select().from(requests).where(requestSelection(scope, id));
        if (!current || current.runId !== run.id || current.memberAccountId !== run.memberAccountId)
          throw new ApprovalOperationError("NOT_FOUND");
        const result = (claimed: boolean, budgetExhausted = false) => ({
          claimed,
          budgetExhausted,
          request: requestView(current),
          startedAt: (current.reviewStartedAt ?? now).toISOString(),
          fence: current.reviewFence ?? run.fence,
        });
        if (current.state !== "pending" || current.reviewStartedAt) return result(false);
        const prior = await tx
          .select({ id: requests.id })
          .from(requests)
          .where(
            and(
              eq(requests.spaceId, scope.spaceId),
              eq(requests.runId, run.id),
              isNotNull(requests.reviewStartedAt),
            ),
          )
          .limit(budget);
        if (prior.length >= budget) return result(false, true);
        const [claimed] = await tx
          .update(requests)
          .set({
            reviewModelId: modelId,
            reviewStartedAt: now,
            reviewFence: run.fence,
            reviewEffectKey: effectKey,
          })
          .where(
            and(
              requestSelection(scope, id),
              isNull(requests.reviewStartedAt),
              eq(requests.state, "pending"),
            ),
          )
          .returning();
        if (!claimed) return result(false);
        await audit.append(
          tx,
          id,
          {
            spaceId: scope.spaceId,
            actorAccountId: run.memberAccountId,
            action: "approval.reviewed",
            targetId: id,
          },
          "pending",
        );
        return {
          claimed: true,
          budgetExhausted: false,
          request: requestView(claimed),
          startedAt: now.toISOString(),
          fence: run.fence,
        };
      });
    },
    async completeReview(scope, run, id, input, now) {
      return db.transaction(async (tx) => {
        const counter = await lock(tx, scope, run.conversationId);
        const active = await assertRunFence(tx, scope, run);
        const [current] = await tx.select().from(requests).where(requestSelection(scope, id));
        if (
          !current ||
          current.runId !== run.id ||
          !current.reviewStartedAt ||
          !current.reviewModelId
        )
          throw new ApprovalOperationError("NOT_FOUND");
        if (current.state !== "pending" || current.review) return requestView(current);
        // Only an Ask fallback may settle a review claimed by an older owner.
        if (input.verdict !== "ask" && current.reviewFence !== run.fence)
          throw new StaleRunFenceError();
        let accepted = input;
        // Settings mutations lock the account row before editing exact rules.
        // Hold it through the verdict so a completed edit wins before dispatch.
        const [accountPolicy] = await tx
          .select({ mode: settings.mode })
          .from(settings)
          .where(eq(settings.accountId, run.memberAccountId))
          .for("share");
        const [override] = await tx
          .select({ mode: spaceSettingsOverrides.approvalMode })
          .from(spaceSettingsOverrides)
          .where(eq(spaceSettingsOverrides.spaceId, scope.spaceId))
          .for("share");
        const [blocked] = await tx
          .select({ decision: rules.decision })
          .from(rules)
          .where(
            and(
              eq(rules.accountId, run.memberAccountId),
              eq(rules.toolName, current.toolName),
              isNull(rules.executable),
              eq(rules.decision, "block"),
            ),
          )
          .limit(1);
        if (input.verdict === "approve" && (override?.mode ?? accountPolicy?.mode) !== "auto")
          accepted = {
            ...input,
            verdict: "ask",
            reason: "The approval policy changed; a member decision is required.",
          };
        if (
          input.verdict === "approve" &&
          (active.untrustedInput ||
            active.inboundProvenance ||
            active.instructionRevision !== (run.instructionRevision ?? 0))
        )
          accepted = {
            ...input,
            verdict: "ask",
            reason: "Changed instructions require a member decision.",
          };
        if (blocked)
          accepted = {
            ...input,
            verdict: "deny",
            reason: "An exact Block rule refuses this action.",
          };
        const review = approvalReviewSchema.parse({
          ...accepted,
          modelId: current.reviewModelId,
          startedAt: current.reviewStartedAt.toISOString(),
          fence: current.reviewFence,
        });
        const [updated] = await tx
          .update(requests)
          .set({ review })
          .where(requestSelection(scope, id))
          .returning();
        const request = requestView(updated!);
        await audit.append(
          tx,
          id,
          {
            spaceId: scope.spaceId,
            actorAccountId: run.memberAccountId,
            action: "approval.reviewed",
            targetId: id,
          },
          "succeeded",
          review.verdict.toUpperCase(),
        );
        if (review.verdict === "ask") return request;
        if (Date.parse(request.expiresAt) <= now.getTime())
          return resolveRequest(
            tx,
            scope,
            request,
            "expired",
            null,
            now,
            counter.sequence + 1,
            run.fence,
          );
        return resolveRequest(
          tx,
          scope,
          request,
          review.verdict === "approve" ? "approved" : "denied",
          null,
          now,
          counter.sequence + 1,
          run.fence,
        );
      });
    },
    async listEffects(scope, runId, now, execution) {
      return db.transaction(async (tx) => {
        let observer: Pick<ExecutionRun, "id" | "conversationId" | "fence">;
        if (execution) {
          if (execution.id !== runId) throw new SpaceNotFound();
          await lock(tx, scope, execution.conversationId);
          const active = await assertRunFence(tx, scope, execution);
          execution.untrustedInput ||= active.untrustedInput || active.inboundProvenance !== null;
          execution.instructionRevision = active.instructionRevision;
          observer = execution;
        } else observer = await lockObservedRun(tx, scope, runId);
        await expireIntents(tx, scope, runId, now, observer);
        const rows = await tx
          .select()
          .from(effects)
          .where(and(eq(effects.spaceId, scope.spaceId), eq(effects.runId, runId)))
          .orderBy(asc(effects.createdAt), asc(effects.key))
          .limit(512);
        return rows.map(effectView);
      });
    },
    async beginEffect(scope, run, effect, now) {
      const result = await db.transaction(async (tx) => {
        await lock(tx, scope, run.conversationId);
        const active = await assertRunFence(tx, scope, run);
        await expireIntents(tx, scope, run.id, now, run);
        const [existing] = await tx
          .select()
          .from(effects)
          .where(and(eq(effects.spaceId, scope.spaceId), eq(effects.key, effect.key)));
        if (existing) return { created: false, effect: effectView(existing) };
        if (active.state !== "running") return { inactive: true };
        const [open] = await tx
          .select({ state: effects.state, createdAt: effects.createdAt })
          .from(effects)
          .where(
            and(
              eq(effects.spaceId, scope.spaceId),
              eq(effects.runId, run.id),
              inArray(effects.state, ["unknown", "intent"]),
            ),
          )
          .orderBy(desc(eq(effects.state, "unknown")), asc(effects.createdAt), asc(effects.key))
          .limit(1);
        // Return the refusal so a stale-intent transition commits before throwing.
        if (open)
          return {
            blocked: open.state,
            retryAt: open.createdAt.getTime() + EFFECT_INTENT_TIMEOUT_MS,
          };
        const [reviewed] = await tx
          .select({ id: requests.id })
          .from(requests)
          .where(
            and(
              eq(requests.spaceId, scope.spaceId),
              eq(requests.conversationId, run.conversationId),
              eq(requests.runId, run.id),
              eq(requests.reviewEffectKey, effect.key),
            ),
          )
          .orderBy(desc(requests.createdAt), desc(requests.id))
          .limit(1);
        await tx.insert(effects).values({
          ...effect,
          approvalRequestId: reviewed?.id ?? null,
          fence: run.fence,
          createdAt: new Date(effect.createdAt),
          completedAt: null,
        });
        return { created: true, effect };
      });
      if ("inactive" in result) throw new Error("RUN_NOT_ACTIVE");
      if ("blocked" in result) {
        if (result.blocked === "unknown") throw new EffectUnknownError();
        throw new EffectInProgressError(result.retryAt!);
      }
      return result;
    },
    async completeEffect(scope, key, state, result, now, run) {
      const updated = await db.transaction(async (tx) => {
        await lock(tx, scope, run.conversationId);
        await assertRunFence(tx, scope, run);
        const [effect] = await tx
          .select({
            runId: effects.runId,
            fence: effects.fence,
            toolCallId: effects.toolCallId,
            toolName: effects.toolName,
          })
          .from(effects)
          .where(and(eq(effects.spaceId, scope.spaceId), eq(effects.key, key)));
        if (!effect || effect.runId !== run.id) return false;
        // The current owner may observe an intent left by another attempt.
        // Persist its uncertainty before refusing that attempt's late outcome.
        await expireIntents(tx, scope, effect.runId as RunId, now, run);
        if (effect.fence !== run.fence) return false;
        const [row] = await tx
          .update(effects)
          .set({ state, result, completedAt: state === "unknown" ? null : now })
          .where(
            and(
              eq(effects.spaceId, scope.spaceId),
              eq(effects.key, key),
              eq(effects.state, "intent"),
            ),
          )
          .returning({ key: effects.key });
        if (row)
          await finishToolEvent(
            tx,
            scope,
            run,
            toolCompletion(effect.toolCallId, result, state, effect.toolName),
            publish,
            now,
          );
        return row !== undefined;
      });
      if (!updated) throw new EffectUnknownError();
    },
  };
}
