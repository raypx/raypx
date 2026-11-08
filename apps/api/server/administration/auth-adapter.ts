import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "@raypx/database/connection";
import { schema, user } from "@raypx/database/schema";
import { eq } from "drizzle-orm";
import type { AuditService } from "./audit.ts";
import { writeAuditSuccess } from "./repository.ts";

/** Preserve Better Auth's validation and session refresh; audit its actual role write atomically. */
export function createAuditedAuthAdapter(
  db: Database,
  audit: AuditService,
): ReturnType<typeof drizzleAdapter> {
  const factory = drizzleAdapter(db, { provider: "pg", schema });
  return (options) => {
    const adapter = factory(options);
    return {
      ...adapter,
      async update<T>(input: Parameters<typeof adapter.update>[0]): Promise<T | null> {
        if (input.model !== "user" || !("role" in input.update)) return adapter.update<T>(input);
        const execute = async () => {
          const scope = audit.current()!;
          const condition = input.where.find(
            (item) => item.field === "id" && (!item.operator || item.operator === "eq"),
          );
          if (!condition || typeof condition.value !== "string" || input.where.length !== 1)
            throw new Error("INVALID_ROLE_TARGET");
          scope.mutationStarted = true;
          try {
            const result = await db.transaction(async (tx) => {
              const [before] = await tx
                .select({ role: user.role })
                .from(user)
                .where(eq(user.id, condition.value as string))
                .for("update");
              const txAdapter = drizzleAdapter(tx, { provider: "pg", schema })(options);
              const updated = await txAdapter.update<T>(input);
              if (!before || !updated) throw new Error("USER_NOT_FOUND");
              await writeAuditSuccess(tx, scope, {
                targetId: condition.value as string,
                before: { role: before.role },
                after: { role: String(input.update.role) },
              });
              return updated;
            });
            scope.committed = true;
            return result;
          } catch (error) {
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
