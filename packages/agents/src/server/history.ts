import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  conversationMemberNames as names,
  conversationMessages as messages,
  conversationRuns as runs,
  conversationReplySegments as segments,
  conversationToolCalls as calls,
  conversationParticipants as agents,
  conversations,
  approvalRequests as approvals,
  spaceMembers,
  user,
} from "@raypx/database/schema";
import { agentIdSchema, type ConversationId } from "@raypx/core/agents";
import {
  conversationHistoryCursorSchema,
  conversationMemberSchema,
  resolvedApprovalSummarySchema,
  replySegmentSchema,
  toolActivitySchema,
  InvalidConversationCursor,
  type ConversationHistoryCursor,
} from "@raypx/core/conversation";
import { SpaceNotFound } from "@raypx/core/spaces";
import { taskText } from "@raypx/core/task-text";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ConversationHistory } from "../conversations.js";
import { conversationView } from "../views.js";
import { message, runView, segmentView } from "./conversation-views.js";
import { toolActivityView } from "./tool-events.js";
import { lastConversationActivity } from "./activity.js";

type Reader = Pick<Database, "select">;
/** Called only by admitted writers, in the message transaction. No account FK erases history. */
export async function rememberMember(
  tx: Reader & Pick<Database, "insert">,
  scope: SpaceScope,
  id: ConversationId,
  accountId: string,
) {
  const [account] = await tx.select({ name: user.name }).from(user).where(eq(user.id, accountId));
  if (!account) throw new SpaceNotFound();
  const displayName = taskText(account.name, 200);
  await tx
    .insert(names)
    .values({ spaceId: scope.spaceId, conversationId: id, accountId, displayName })
    .onConflictDoUpdate({
      target: [names.spaceId, names.conversationId, names.accountId],
      set: { displayName },
    });
}

export async function snapshotAttribution(
  tx: Reader,
  scope: SpaceScope,
  id: ConversationId,
  runIds?: string[],
) {
  const directory = await tx
    .select({
      accountId: names.accountId,
      retainedName: names.displayName,
      currentName: user.name,
      isMember: sql<boolean>`${spaceMembers.accountId} is not null`,
    })
    .from(names)
    .leftJoin(
      spaceMembers,
      and(
        eq(spaceMembers.spaceId, names.spaceId),
        eq(spaceMembers.accountId, names.accountId),
        isNull(spaceMembers.removedAt),
      ),
    )
    .leftJoin(user, eq(user.id, spaceMembers.accountId))
    .where(and(eq(names.spaceId, scope.spaceId), eq(names.conversationId, id)))
    .orderBy(asc(names.accountId))
    .limit(101);
  const resolved = await tx
    .select({
      requestId: approvals.id,
      runId: approvals.runId,
      toolCallId: approvals.toolCallId,
      outcome: approvals.state,
      answeredByAccountId: approvals.answeredByAccountId,
      resolvedAt: approvals.resolvedAt,
    })
    .from(approvals)
    .where(
      and(
        eq(approvals.spaceId, scope.spaceId),
        eq(approvals.conversationId, id),
        ne(approvals.state, "pending"),
        runIds === undefined ? undefined : inArray(approvals.runId, runIds),
      ),
    )
    .orderBy(desc(approvals.resolvedAt), desc(approvals.id))
    .limit(101);
  return {
    participants: directory.slice(0, 100).map((row) =>
      conversationMemberSchema.parse({
        accountId: row.accountId,
        displayName: taskText(row.currentName ?? row.retainedName, 200),
        isMember: row.isMember,
      }),
    ),
    participantsTruncated: directory.length > 100,
    resolvedApprovals: resolved
      .slice(0, 100)
      .reverse()
      .map((row) =>
        resolvedApprovalSummarySchema.parse({
          ...row,
          resolvedAt: row.resolvedAt?.toISOString(),
        }),
      ),
    resolvedApprovalsTruncated: resolved.length > 100,
  };
}

/** Caller holds the conversation counter, including lazy cancellation, through this read. */
export async function readHistory(
  tx: Reader,
  scope: SpaceScope,
  id: ConversationId,
  limit: number,
  cursor: number,
  before?: ConversationHistoryCursor,
): Promise<ConversationHistory> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Invalid history limit");
  if (before) {
    conversationHistoryCursorSchema.parse(before);
    if (
      before.spaceId !== scope.spaceId ||
      before.conversationId !== id ||
      before.beforeSequence > cursor
    )
      throw new InvalidConversationCursor();
  }
  const [saved] = await tx
    .select({ conversation: conversations, lastActivityAt: lastConversationActivity() })
    .from(conversations)
    .where(and(eq(conversations.spaceId, scope.spaceId), eq(conversations.id, id)));
  if (!saved) throw new SpaceNotFound();
  const { conversation, lastActivityAt } = saved;
  const selected = await tx
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.spaceId, scope.spaceId),
        eq(messages.conversationId, id),
        before ? lt(messages.sequence, before.beforeSequence) : undefined,
      ),
    )
    .orderBy(desc(messages.sequence))
    .limit(limit + 1);
  const rows = selected.slice(0, limit).reverse();
  // All descendants keep their parent's messageSequence, including delegated child Runs.
  const runRows = await tx
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.spaceId, scope.spaceId),
        eq(runs.conversationId, id),
        gte(runs.messageSequence, rows[0]?.sequence ?? 1),
        lte(runs.messageSequence, rows.at(-1)?.sequence ?? 0),
      ),
    )
    .orderBy(asc(runs.messageSequence), asc(runs.id))
    .limit(501);
  const includedRuns = runRows.slice(0, 500);
  const runIds = includedRuns.map((run) => run.id);
  const segmentRows = await tx
    .select({ segment: segments, agentId: runs.agentId, parentRunId: runs.parentRunId })
    .from(segments)
    .innerJoin(
      runs,
      and(
        eq(runs.spaceId, segments.spaceId),
        eq(runs.conversationId, segments.conversationId),
        eq(runs.id, segments.runId),
      ),
    )
    .where(
      and(
        eq(segments.spaceId, scope.spaceId),
        eq(segments.conversationId, id),
        inArray(segments.runId, runIds),
      ),
    )
    .orderBy(asc(segments.sequence))
    .limit(501);
  const activity = await tx
    .select({ call: calls, agentId: runs.agentId, parentRunId: runs.parentRunId })
    .from(calls)
    .innerJoin(
      runs,
      and(
        eq(runs.spaceId, calls.spaceId),
        eq(runs.conversationId, calls.conversationId),
        eq(runs.id, calls.runId),
      ),
    )
    .where(
      and(
        eq(calls.spaceId, scope.spaceId),
        eq(calls.conversationId, id),
        inArray(calls.runId, runIds),
      ),
    )
    .orderBy(desc(calls.startedAt), desc(calls.runId), desc(calls.toolCallId))
    .limit(101);
  const agentIds =
    conversation.kind === "group"
      ? await tx
          .select({ id: agents.agentId })
          .from(agents)
          .where(
            and(
              eq(agents.spaceId, scope.spaceId),
              eq(agents.conversationId, id),
              isNull(agents.removedAt),
            ),
          )
          .orderBy(asc(agents.createdAt), asc(agents.agentId))
          .limit(32)
      : [];
  return {
    conversation: {
      ...conversationView(conversation, lastActivityAt),
      ...(conversation.kind === "group"
        ? { agentIds: agentIds.map((a) => agentIdSchema.parse(a.id)) }
        : {}),
    },
    messages: await Promise.all(rows.map((row) => message(tx, row))),
    runs: includedRuns.map(runView),
    runsTruncated: runRows.length > 500,
    segments: segmentRows
      .slice(0, 500)
      .map(({ segment, agentId, parentRunId }) =>
        replySegmentSchema.parse({ ...segmentView(segment), agentId, parentRunId }),
      ),
    segmentsTruncated: segmentRows.length > 500,
    toolActivity: activity
      .slice(0, 100)
      .reverse()
      .map(({ call, agentId, parentRunId }) =>
        toolActivitySchema.parse({ ...toolActivityView(call), agentId, parentRunId }),
      ),
    toolActivityTruncated: activity.length > 100,
    ...(await snapshotAttribution(tx, scope, id, runIds)),
    cursor,
    olderCursor:
      selected.length > limit && rows[0]
        ? { spaceId: scope.spaceId, conversationId: id, beforeSequence: rows[0].sequence }
        : null,
  };
}
