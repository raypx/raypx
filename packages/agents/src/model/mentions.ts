import type { AgentId } from "@raypx/core/agents";

/** Ranges identify only deliberately selected mentions, never names parsed from prose. */
export interface MentionToken {
  agentId: AgentId;
  label: string;
  start: number;
  end: number;
}
export function mentionIds(tokens: readonly MentionToken[]): AgentId[] {
  return [...new Set(tokens.map((token) => token.agentId))];
}
export function editMentionTokens(previous: string, next: string, tokens: readonly MentionToken[]) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return tokens.flatMap((token) => {
    if (token.end <= start) return [token];
    if (token.start >= oldEnd)
      return [{ ...token, start: token.start + delta, end: token.end + delta }];
    return [];
  });
}
export function insertMention(
  text: string,
  tokens: readonly MentionToken[],
  start: number,
  end: number,
  agentId: AgentId,
  label: string,
) {
  const mention = `@${label}`;
  const next = text.slice(0, start) + mention + " " + text.slice(end);
  return {
    text: next,
    tokens: [
      ...editMentionTokens(text, next, tokens),
      { agentId, label, start, end: start + mention.length },
    ].sort((a, b) => a.start - b.start),
    caret: start + mention.length + 1,
  };
}
export function validMentionTokens(value: unknown, text: string): MentionToken[] {
  if (!Array.isArray(value)) return [];
  const tokens: MentionToken[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.agentId !== "string" ||
      !item.agentId ||
      item.agentId.length > 128 ||
      typeof item.label !== "string" ||
      item.label.length > 120 ||
      !Number.isInteger(item.start) ||
      !Number.isInteger(item.end) ||
      item.start < 0 ||
      item.end > text.length ||
      item.start >= item.end ||
      text.slice(item.start, item.end) !== `@${item.label}` ||
      tokens.some((token) => item.start < token.end && item.end > token.start)
    )
      continue;
    tokens.push({
      agentId: item.agentId as AgentId,
      label: item.label,
      start: item.start,
      end: item.end,
    });
  }
  return tokens.slice(0, 32);
}

/** A query only opens a picker; recipients still come exclusively from selected tokens. */
export function mentionQueryAt(text: string, caret: number) {
  const match = /@([^@\s]*)$/.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: caret - query.length - 1, end: caret, query };
}
