import { DomainError } from "@voidmix/shared";
import type { User, UserStatus, AuditEvent } from "./model.js";
export function requireStatusTarget(
  target: User | null,
  actorId: string,
  status: UserStatus,
): User {
  if (!target) throw new DomainError("USER_NOT_FOUND", "The requested user does not exist.");
  if (actorId === target.id && status === "suspended")
    throw new DomainError("SELF_SUSPENSION", "Administrators cannot suspend themselves.");
  return target;
}
export function isAdministratorRemoval(target: User, status: UserStatus) {
  return (
    status === "suspended" &&
    target.status === "active" &&
    (target.role === "admin" || target.role === "owner")
  );
}
export function assertAdministratorRemains(count: number) {
  if (count <= 1)
    throw new DomainError("LAST_ADMIN", "The final active administrator cannot be suspended.");
}
export function userStatusAudit(input: {
  id: string;
  actorId: string;
  target: User;
  status: UserStatus;
  occurredAt: Date;
}): AuditEvent {
  return {
    id: input.id,
    actorId: input.actorId,
    action: "user.status.changed",
    targetType: "user",
    targetId: input.target.id,
    targetUserId: input.target.id,
    occurredAt: input.occurredAt,
    metadata: { from: input.target.status, to: input.status },
  };
}
export function initialAdminAudit(user: User, id: string, occurredAt: Date): AuditEvent {
  return {
    id,
    actorId: user.id,
    action: "admin.created",
    targetType: "user",
    targetId: user.id,
    targetUserId: user.id,
    occurredAt,
    metadata: { email: user.email },
  };
}
