import { belongsToSpace, SpaceNotFound, type SpaceId, type SpaceMember } from "@raypx/core/spaces";

const admission = Symbol("Space admission");
export interface SpaceScope {
  readonly spaceId: SpaceId;
  readonly member: SpaceMember;
  readonly [admission]: true;
}
export function resolveSpaceScope(
  member: SpaceMember,
  accountId: string,
  requestedSpaceId: SpaceId,
): SpaceScope {
  if (!belongsToSpace(member, accountId, requestedSpaceId)) throw new SpaceNotFound();
  return { spaceId: member.spaceId, member, [admission]: true };
}
