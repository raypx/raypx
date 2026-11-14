import { randomBytes } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { user, verification } from "@raypx/database/schema";
import { assignedRoles, accountRoles } from "@raypx/auth/access";
import { ORPCError } from "@orpc/server";
import type { AuditService } from "./audit.js";
import { writeAuditSuccess } from "./repository.js";

/** The link is returned once; only its ordinary auth verification record is retained. */
export function createPasswordResetLinks(
  db: Database,
  audit: AuditService,
  mailAvailable: (database?: Pick<Database, "select">) => Promise<boolean>,
) {
  return async (actorId: string, targetId: string) => {
    const scope = audit.current();
    if (!scope || scope.action !== "user.password.reset-link" || scope.actorId !== actorId)
      throw new ORPCError("FORBIDDEN");
    scope.mutationStarted = true;
    const result = await db.transaction(async (tx) => {
      if (await mailAvailable(tx)) throw new ORPCError("BAD_REQUEST");
      // Match role-write ordering; recheck the actor after acquiring the lock.
      const accounts = await tx
        .select()
        .from(user)
        .where(inArray(user.id, [actorId, targetId]))
        .orderBy(user.id)
        .for("update");
      const actor = accounts.find((row) => row.id === actorId);
      const target = accounts.find((row) => row.id === targetId);
      if (
        !actor ||
        actor.banned ||
        !assignedRoles(actor.role).some(
          (role) => accountRoles[role].authorize({ raypx: ["users.password.reset"] }).success,
        )
      )
        throw new ORPCError("FORBIDDEN");
      if (!target || target.banned) throw new ORPCError("BAD_REQUEST");
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      await tx
        .delete(verification)
        .where(
          and(eq(verification.value, targetId), like(verification.identifier, "reset-password:%")),
        );
      await tx.insert(verification).values({
        id: crypto.randomUUID(),
        identifier: `reset-password:${token}`,
        value: targetId,
        expiresAt,
      });
      await writeAuditSuccess(tx, scope, { targetId, before: null, after: null });
      return { token, expiresAt: expiresAt.toISOString() };
    });
    scope.committed = true;
    return result;
  };
}
