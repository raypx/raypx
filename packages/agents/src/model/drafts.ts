import { validMentionTokens, type MentionToken } from "./mentions.js";
import { runIdSchema, type RunId } from "@raypx/core/conversation";
import type { AgentId } from "@raypx/core/agents";
import type { ConversationOwner, ConversationSelection } from "./port.js";

export const MAX_CONVERSATION_DRAFT = 32_000;
export interface PendingMessage {
  idempotencyKey: string;
  mentions?: AgentId[] | undefined;
  steerRunId?: RunId | undefined;
  text: string;
}
export interface ConversationDraft {
  mentionTokens?: MentionToken[] | undefined;
  text: string;
  pending: PendingMessage | null;
}
/** Tuple encoding avoids delimiter collisions and includes the complete remote owner. */
export function conversationDraftKey(owner: ConversationOwner, selection: ConversationSelection) {
  return `raypx:conversation:v1:${JSON.stringify([
    owner.origin,
    owner.accountId,
    selection.spaceId,
    selection.conversationId,
  ])}`;
}
function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_CONVERSATION_DRAFT;
}
export function readConversationDraft(raw: string | null): ConversationDraft {
  const empty = { text: "", pending: null };
  if (!raw || raw.length > MAX_CONVERSATION_DRAFT * 12 + 1_024) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1)
      return empty;
    if (!("text" in value) || !isText(value.text)) return empty;
    const mentionTokens =
      "mentionTokens" in value ? validMentionTokens(value.mentionTokens, value.text) : [];
    const tokens = mentionTokens.length ? { mentionTokens } : {};
    if (!("pending" in value) || value.pending === null)
      return { text: value.text, pending: null, ...tokens };
    const pending = value.pending;
    if (
      !pending ||
      typeof pending !== "object" ||
      !("text" in pending) ||
      !isText(pending.text) ||
      !pending.text.trim() ||
      !("idempotencyKey" in pending) ||
      typeof pending.idempotencyKey !== "string" ||
      pending.idempotencyKey.length < 1 ||
      pending.idempotencyKey.length > 128
    )
      return empty;
    if (
      "mentions" in pending &&
      (!Array.isArray(pending.mentions) ||
        pending.mentions.length > 32 ||
        !pending.mentions.every(
          (id) => typeof id === "string" && id.length > 0 && id.length <= 128,
        ))
    )
      return empty;
    const steerRunId = "steerRunId" in pending ? runIdSchema.safeParse(pending.steerRunId) : null;
    if (steerRunId && !steerRunId.success) return empty;
    return {
      text: value.text,
      ...tokens,
      pending: {
        text: pending.text,
        idempotencyKey: pending.idempotencyKey,
        ...(steerRunId?.success ? { steerRunId: steerRunId.data } : {}),
        ...("mentions" in pending &&
        Array.isArray(pending.mentions) &&
        pending.mentions.length <= 32 &&
        pending.mentions.every((id) => typeof id === "string" && id.length > 0 && id.length <= 128)
          ? { mentions: pending.mentions as AgentId[] }
          : {}),
      },
    };
  } catch {
    return empty;
  }
}
export function writeConversationDraft(draft: ConversationDraft) {
  return JSON.stringify({
    version: 1,
    text: draft.text,
    pending: draft.pending,
    ...(draft.mentionTokens?.length ? { mentionTokens: draft.mentionTokens } : {}),
  });
}
