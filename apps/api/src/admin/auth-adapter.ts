import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { accountRoles, assignedRoles } from "@raypx/auth/access";
import type { Database } from "@raypx/database/connection";
import { schema, user } from "@raypx/database/schema";
import { APIError } from "better-auth/api";
import { usableEmail } from "@raypx/core/auth";
import type { Registration } from "./registration.js";
import { inArray } from "drizzle-orm";
import type { AuditService } from "./audit.js";
import { writeAuditSuccess } from "./repository.js";

/** Preserve Better Auth's validation and session refresh; audit its actual role write atomically. */
export function createAuditedAuthAdapter(
  db: Database,
  audit: AuditService,
  registration?: Registration,
  inTransaction = false,
): ReturnType<typeof drizzleAdapter> {
  const factory = drizzleAdapter(db, { provider: "pg", schema });
  return (options) => {
    const adapter = factory(options);
    return {
      ...adapter,
      ...(registration
        ? {
            async create<T extends Record<string, unknown>, R = T>(input: {
              model: string;
              data: Omit<T, "id">;
              select?: string[] | undefined;
              forceAllowId?: boolean | undefined;
            }): Promise<R> {
              if (input.model !== "user") return adapter.create<T, R>(input);
              const execute = (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) =>
                registration.create(tx, input.data, (data) =>
                  drizzleAdapter(tx, { provider: "pg", schema })(options).create<
                    Record<string, unknown>,
                    R
                  >({ ...input, data, forceAllowId: true }),
                );
              return inTransaction
                ? execute(db as unknown as Parameters<typeof execute>[0])
                : db.transaction(execute);
            },
            async transaction<T>(callback: (tx: typeof adapter) => Promise<T>): Promise<T> {
              return db.transaction((tx) =>
                callback(
                  createAuditedAuthAdapter(
                    tx as unknown as Database,
                    audit,
                    registration,
                    true,
                  )(options),
                ),
              );
            },
          }
        : {}),
      async update<T>(input: Parameters<typeof adapter.update>[0]): Promise<T | null> {
        if (input.model !== "user" || !("role" in input.update)) return adapter.update<T>(input);
        const execute = async () => {
          const scope = audit.current()!;
          const condition = input.where.find(
            (item) => item.field === "id" && (!item.operator || item.operator === "eq"),
          );
          if (!condition || typeof condition.value !== "string" || input.where.length !== 1)
            throw new Error("INVALID_ROLE_TARGET");
          const targetId = condition.value;
          const actorId = scope.source === "http" ? scope.actorId : null;
          scope.mutationStarted = true;
          try {
            const result = await db.transaction(async (tx) => {
              // Lock actor and target in the same order even for opposing role changes.
              const accounts = await tx
                .select({
                  id: user.id,
                  role: user.role,
                  emailVerified: user.emailVerified,
                  emailVerificationSkipped: user.emailVerificationSkipped,
                  banned: user.banned,
                })
                .from(user)
                .where(inArray(user.id, actorId ? [actorId, targetId] : [targetId]))
                .orderBy(user.id)
                .for("update");
              if (scope.source === "http") {
                const actor = accounts.find(({ id }) => id === actorId);
                if (
                  !actor ||
                  (!usableEmail(actor) &&
                    (!registration || (await registration.mailAvailable(tx)))) ||
                  actor?.banned ||
                  actor?.id === targetId ||
                  !assignedRoles(actor?.role).some(
                    (role) => accountRoles[role].authorize({ user: ["set-role"] }).success,
                  )
                )
                  throw new APIError("FORBIDDEN", { code: "FORBIDDEN", message: "Access denied" });
              }
              const before = accounts.find(({ id }) => id === targetId);
              if (!before) throw new Error("USER_NOT_FOUND");
              const txAdapter = drizzleAdapter(tx, { provider: "pg", schema })(options);
              const updated = await txAdapter.update<T>(input);
              if (!updated) throw new Error("USER_NOT_FOUND");
              await writeAuditSuccess(tx, scope, {
                targetId,
                before: { role: before.role },
                after: { role: String(input.update.role) },
              });
              return updated;
            });
            scope.committed = true;
            return result;
          } catch (error) {
            if (!(error instanceof APIError && error.statusCode === 403))
              await audit.fail("failed", "ROLE_UPDATE_FAILED");
            throw error;
          }
        };
        return audit.run(
          {
            action: "user.role.update",
            actorId: audit.current()?.actorId ?? null,
            requestId: audit.current()?.requestId ?? crypto.randomUUID(),
            source: audit.current()?.source ?? "operator",
          },
          execute,
        );
      },
    };
  };
}
