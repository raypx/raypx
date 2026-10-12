import {
  requireStatusTarget,
  isAdministratorRemoval,
  assertAdministratorRemains,
  userStatusAudit,
  initialAdminAudit,
  type User,
  type UserRepository,
  type UserListQuery,
  type UserStatus,
} from "@voidmix/core";
import { executionContext } from "./execution.js";
import type { ExecutionOptions } from "./types.js";
export function createUserAdministration(options: ExecutionOptions & { users: UserRepository }) {
  const { users } = options;
  const { now, id } = executionContext(options);
  return {
    list: (query: UserListQuery) => users.list(query),
    get: (userId: string) => users.getById(userId),
    audit: (limit: number) => users.listAudit(limit),
    updateStatus: (input: { actorId: string; userId: string; status: UserStatus }) =>
      users.runAdministration(async (tx) => {
        const target = requireStatusTarget(
          await tx.getById(input.userId),
          input.actorId,
          input.status,
        );
        if (isAdministratorRemoval(target, input.status))
          assertAdministratorRemains(await tx.countActiveAdministrators());
        if (target.status === input.status) return target;
        const updated = await tx.updateStatus(target.id, input.status);
        await tx.appendAudit(
          userStatusAudit({
            id: id(),
            actorId: input.actorId,
            target,
            status: input.status,
            occurredAt: now(),
          }),
        );
        return updated;
      }),
    ensureAdmin: (input: { email: string; displayName: string }) =>
      users.runAdministration(async (tx) => {
        const email = input.email.toLowerCase();
        const existing = await tx.getByEmail(email);
        if (existing) return existing;
        const admin: User = {
          id: id(),
          email,
          displayName: input.displayName,
          role: "admin",
          status: "active",
          createdAt: now(),
        };
        await tx.save(admin);
        await tx.appendAudit(initialAdminAudit(admin, id(), now()));
        return admin;
      }),
  };
}
