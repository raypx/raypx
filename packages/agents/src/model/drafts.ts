import type { ConversationOwner, ConversationSelection } from "./port.js";

export const MAX_CONVERSATION_DRAFT = 32_000;
export interface PendingMessage {
  idempotencyKey: string;
  text: string;
}
export interface ConversationDraft {
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
    if (!("pending" in value) || value.pending === null) return { text: value.text, pending: null };
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
    return {
      text: value.text,
      pending: { text: pending.text, idempotencyKey: pending.idempotencyKey },
    };
  } catch {
    return empty;
  }
}
export function writeConversationDraft(draft: ConversationDraft) {
  return JSON.stringify({ version: 1, text: draft.text, pending: draft.pending });
}
