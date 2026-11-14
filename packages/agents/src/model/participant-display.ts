import type { ConversationMember } from "@raypx/core/conversation";
import type { SpaceDirectoryMember } from "@raypx/core/spaces";

/** Historical names are display context only; current directory entries take precedence. */
export function conversationMemberLabel(
  accountId: string,
  viewerId: string,
  participants: readonly ConversationMember[],
  members: readonly SpaceDirectoryMember[] | undefined,
  copy: { you: string; member: string; departed(name: string): string },
): string {
  if (accountId === viewerId) return copy.you;
  const current = members?.find((entry) => entry.accountId === accountId);
  if (current) return current.name || copy.member;
  const historical = participants.find((entry) => entry.accountId === accountId);
  if (!historical) return copy.member;
  const name = historical.displayName || copy.member;
  return historical.isMember ? name : copy.departed(name);
}
