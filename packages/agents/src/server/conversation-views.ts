import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  conversationMessageMentions as messageMentions,
  conversationAttachments,
  conversationAttachmentDeliveries,
  type conversationMessages as messages,
  type conversationRuns as runs,
  type conversationReplySegments as segments,
} from "@raypx/database/schema";
import { attachmentView } from "./attachments.js";
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
  const uploaded = await tx
    .select({
      id: conversationAttachments.id,
      name: conversationAttachments.name,
      mediaType: conversationAttachments.mediaType,
      size: conversationAttachments.size,
      sha256: conversationAttachments.sha256,
      createdAt: conversationAttachments.createdAt,
    })
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.spaceId, row.spaceId),
        eq(conversationAttachments.conversationId, row.conversationId),
        eq(conversationAttachments.messageId, row.id),
      ),
    )
    .orderBy(asc(conversationAttachments.createdAt), asc(conversationAttachments.id));
  const outcomes = uploaded.length
    ? await tx
        .select()
        .from(conversationAttachmentDeliveries)
        .where(
          and(
            eq(conversationAttachmentDeliveries.spaceId, row.spaceId),
            eq(conversationAttachmentDeliveries.conversationId, row.conversationId),
            eq(conversationAttachmentDeliveries.messageId, row.id),
          ),
        )
        .orderBy(asc(conversationAttachmentDeliveries.runId))
    : [];
  return messageSchema.parse({
    attachments: uploaded.map((attachment) => ({
      ...attachmentView(attachment),
      deliveries: outcomes
        .filter((outcome) => outcome.attachmentId === attachment.id && outcome.state !== "staging")
        .slice(-32)
        .map(({ runId, state, path, reason }) => ({ runId, state, path, reason })),
    })),
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
