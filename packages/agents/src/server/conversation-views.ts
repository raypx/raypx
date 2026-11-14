import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  conversationMessageMentions as messageMentions,
  type conversationMessages as messages,
  type conversationRuns as runs,
  type conversationReplySegments as segments,
} from "@raypx/database/schema";
import { messageSchema, runSchema, replySegmentSchema } from "@raypx/core/conversation";

export async function message(tx: Pick<Database, "select">, row: typeof messages.$inferSelect) {
  const mentions = await tx
    .select({ agentId: messageMentions.agentId })
    .from(messageMentions)
    .where(
      and(
        eq(messageMentions.spaceId, row.spaceId),
        eq(messageMentions.conversationId, row.conversationId),
        eq(messageMentions.messageId, row.id),
      ),
    )
    .orderBy(asc(messageMentions.position), asc(messageMentions.agentId));
  return messageSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    conversationId: row.conversationId,
    sequence: row.sequence,
    author: {
      kind: row.authorAgentId ? "agent" : "member",
      accountId: row.authorAccountId,
      ...(row.authorAgentId ? { agentId: row.authorAgentId } : {}),
    },
    mentions: mentions.map((m) => m.agentId),
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  });
}
export function runView(row: typeof runs.$inferSelect) {
  return runSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    conversationId: row.conversationId,
    agentId: row.agentId,
    parentRunId: row.parentRunId,
    trigger: row.trigger,
    messageId: row.messageId,
    memberAccountId: row.memberAccountId,
    model: { modelId: row.modelId },
    state: row.state,
    failureCode: row.failureCode,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    routineId: row.routineId,
    routineDueAt: row.routineDueAt?.toISOString() ?? null,
    routineTimezone: row.routineTimezone,
    inboundProvenance: row.inboundProvenance,
    untrustedInput: row.untrustedInput || row.inboundProvenance !== null || row.trigger === "agent",
    computerInputPaused: row.state === "waiting" && row.computerInputPaused,
  });
}
export function segmentView(row: typeof segments.$inferSelect) {
  const { fence: _fence, ...publicRow } = row;
  return replySegmentSchema.parse({ ...publicRow, createdAt: row.createdAt.toISOString() });
}
