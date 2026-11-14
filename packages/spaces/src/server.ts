import type {
  Space,
  SpaceId,
  SpaceInput,
  SpaceMember,
  SpaceRole,
  SpaceDirectoryMember,
  SpaceInvitation,
  SpaceSettings,
  SpaceAuditEntry,
  SpaceEvent,
} from "@raypx/core/spaces";
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
export interface SpaceMemberRemoval {
  accountId: string;
  pausedRoutines: { id: string; name: string }[];
}
export interface SpaceInvitationPreview {
  spaceId: SpaceId;
  spaceName: string;
  inviterName: string;
  expiresAt: string;
  alreadyMember: boolean;
  shares: ["agents", "conversations", "memory", "routines", "team_computer", "pages"];
}
export interface SpaceManagement {
  get(scope: SpaceScope): Promise<Space>;
  rename(scope: SpaceScope, input: SpaceInput): Promise<Space>;
  delete(scope: SpaceScope): Promise<{ spaceId: SpaceId; status: "deleting" }>;
  leave(scope: SpaceScope): Promise<SpaceMemberRemoval>;
  members(scope: SpaceScope): Promise<SpaceDirectoryMember[]>;
  updateMemberRole(scope: SpaceScope, accountId: string, role: SpaceRole): Promise<SpaceMember>;
  removeMember(scope: SpaceScope, accountId: string): Promise<SpaceMemberRemoval>;
  invitations(scope: SpaceScope): Promise<SpaceInvitation[]>;
  createInvitation(scope: SpaceScope): Promise<SpaceInvitation & { token: string }>;
  cancelInvitation(scope: SpaceScope, id: string): Promise<{ cancelled: number }>;
  cancelInvitations(scope: SpaceScope): Promise<{ cancelled: number }>;
  previewInvitation(accountId: string, token: string): Promise<SpaceInvitationPreview>;
  acceptInvitation(
    accountId: string,
    token: string,
  ): Promise<SpaceMembership & { joined: boolean }>;
  settings(scope: SpaceScope): Promise<SpaceSettings>;
  setApprovalOverride(scope: SpaceScope, mode: "ask" | "never" | "auto"): Promise<SpaceSettings>;
  clearApprovalOverride(scope: SpaceScope): Promise<SpaceSettings>;
  audit(
    scope: SpaceScope,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: SpaceAuditEntry[]; nextCursor: string | null }>;
  events(scope: SpaceScope, after: number, limit: number): Promise<SpaceEvent[]>;
}
export interface SpaceNotice {
  spaceId: string;
  sequence: number;
  kind: string;
  accountId?: string;
  reason?: "removed" | "left";
}
export interface SpaceFanout {
  subscribe(listener: (notice: SpaceNotice) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}
