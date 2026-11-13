import type { Space, SpaceId, SpaceInput, SpaceMember } from "@raypx/core/spaces";
import type { SpaceScope } from "./scope.js";
export type { SpaceScope } from "./scope.js";
export { resolveSpaceScope } from "./scope.js";

export interface SpaceMembership {
  space: Space;
  member: SpaceMember;
}
export interface SpacesRepository {
  get(scope: SpaceScope): Promise<Space>;
  getMember(scope: SpaceScope, accountId: string): Promise<SpaceMember>;
}
/** Only the request boundary supplies the freshly resolved session account. */
export interface SpaceAccess {
  list(accountId: string): Promise<SpaceMembership[]>;
  create(accountId: string, input: SpaceInput): Promise<SpaceMembership>;
  resolve(accountId: string, requestedSpaceId: SpaceId): Promise<SpaceScope>;
}
