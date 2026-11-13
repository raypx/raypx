import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
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
} from "@raypx/database/schema";
import {
  approvalRequestSchema,
  approvalSettingsSchema,
  effectSchema,
  type ApprovalRequest,
  type ApprovalState,
} from "@raypx/core/approvals";
import type { ConversationId } from "@raypx/core/agents";
import type { Run, RunId } from "@raypx/core/conversation";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  ApprovalOperationError,
  EffectUnknownError,
  EffectInProgressError,
  type ApprovalsRepository,
} from "../approvals.js";
import { publishConversationNotice } from "./conversations.js";
import { EFFECT_INTENT_TIMEOUT_MS } from "../tool-limits.js";
import type { ExecutionRun } from "../conversations.js";
import { assertRunFence } from "./fence.js";

type Transaction = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;
function requestView(row: typeof requests.$inferSelect): ApprovalRequest {
  const { fence: _fence, ...request } = row;
  return approvalRequestSchema.parse({
    ...request,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  });
}
function effectView(row: typeof effects.$inferSelect) {
  const { fence: _fence, ...effect } = row;
  return effectSchema.parse({
    ...effect,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
}
/** Cards deliberately omit the exact arguments, including file contents. */
export function approvalCardData(request: ApprovalRequest) {
  return {
    toolName: request.toolName,
    argumentSummary: request.argumentSummary,
    target: request.target,
    memberAccountId: request.memberAccountId,
    expiresAt: request.expiresAt,
  };
}
export function createApprovalsRepository(
  db: Database,
  publish = publishConversationNotice,
): ApprovalsRepository {
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
  async function expireIntents(tx: Transaction, scope: SpaceScope, runId: RunId, now: Date) {
    await tx
      .update(effects)
      .set({ state: "unknown" })
      .where(
        and(
          eq(effects.spaceId, scope.spaceId),
          eq(effects.runId, runId),
          eq(effects.state, "intent"),
          lte(effects.createdAt, new Date(now.getTime() - EFFECT_INTENT_TIMEOUT_MS)),
        ),
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
      data: { state, failureCode: null },
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
      .set({ state: "running" })
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
    async getSettings(accountId, defaultMode) {
      return db.transaction(async (tx) => {
        await tx.insert(settings).values({ accountId, mode: defaultMode }).onConflictDoNothing();
        const [row] = await tx
          .select()
          .from(settings)
          .where(eq(settings.accountId, accountId))
          .for("share");
        const items = await tx
          .select({
            toolName: rules.toolName,
            executable: rules.executable,
            decision: rules.decision,
          })
          .from(rules)
          .where(eq(rules.accountId, accountId))
          .orderBy(asc(rules.toolName), asc(rules.executable));
        return approvalSettingsSchema.parse({ mode: row!.mode, rules: items });
      });
    },
    async updateSettings(accountId, input) {
      return db.transaction(async (tx) => {
        await tx.insert(settings).values({ accountId, mode: input.mode }).onConflictDoNothing();
        await tx.select().from(settings).where(eq(settings.accountId, accountId)).for("update");
        await tx
          .update(settings)
          .set({ mode: input.mode, updatedAt: new Date() })
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
        return { mode: input.mode, rules: [...unique.values()] };
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
      const result = await db.transaction(async (tx) => {
        const before = await findRequest(tx, scope, id);
        if (before.memberAccountId !== scope.member.accountId)
          throw new ApprovalOperationError("NOT_ADDRESSED");
        const counter = await lock(tx, scope, before.conversationId);
        const current = await findRequest(tx, scope, id);
        if (current.state !== "pending") throw new ApprovalOperationError("ALREADY_RESOLVED");
        if (Date.parse(current.expiresAt) <= now.getTime())
          return {
            expired: true,
            request: await resolveRequest(
              tx,
              scope,
              current,
              "expired",
              null,
              now,
              counter.sequence + 1,
            ),
          };
        if (answer.decision === "approved" && answer.allowTool) {
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
          await tx
            .insert(rules)
            .values({
              accountId: scope.member.accountId,
              toolName: current.toolName,
              executable,
              decision: "allow",
            })
            .onConflictDoNothing();
        }
        return {
          expired: false,
          request: await resolveRequest(
            tx,
            scope,
            current,
            answer.decision,
            scope.member.accountId,
            now,
            counter.sequence + 1,
          ),
        };
      });
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
        const [existing] = await tx
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
          .limit(1);
        if (existing) return requestView(existing);
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
            expiresAt,
            createdAt,
          })
          .returning();
        const request = requestView(row!);
        await tx
          .update(runs)
          .set({ state: "waiting" })
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
    async listEffects(scope, runId, now, execution) {
      return db.transaction(async (tx) => {
        if (execution) {
          await lock(tx, scope, execution.conversationId);
          await assertRunFence(tx, scope, execution);
        } else await requireRun(tx, scope, runId);
        await expireIntents(tx, scope, runId, now);
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
        await expireIntents(tx, scope, run.id, now);
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
        await tx.insert(effects).values({
          ...effect,
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
          .select({ runId: effects.runId, fence: effects.fence })
          .from(effects)
          .where(and(eq(effects.spaceId, scope.spaceId), eq(effects.key, key)));
        if (!effect || effect.runId !== run.id) return false;
        // The current owner may observe an intent left by another attempt.
        // Persist its uncertainty before refusing that attempt's late outcome.
        await expireIntents(tx, scope, effect.runId as RunId, now);
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
        return row !== undefined;
      });
      if (!updated) throw new EffectUnknownError();
    },
  };
}
