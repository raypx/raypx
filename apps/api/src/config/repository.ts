import type { AuditService } from "../admin/audit.js";
import { writeAuditSuccess } from "../admin/repository.js";
import type { Database } from "@raypx/database/connection";
import { systemConfiguration } from "@raypx/database/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  configurationDefaults,
  configurationSnapshotSchema,
  type ConfigurationSnapshot,
} from "@raypx/contracts/api";
import type { ConfigurationRepository } from "./types.js";

export function createConfigurationRepository(
  db: Database,
  audit?: AuditService,
): ConfigurationRepository {
  const snapshot = (row: typeof systemConfiguration.$inferSelect): ConfigurationSnapshot =>
    configurationSnapshotSchema.parse({
      values: {
        siteName: row.siteName,
        registrationEnabled: row.registrationEnabled,
        cleanupEnabled: row.cleanupEnabled,
      },
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
    });
  return {
    async read() {
      const [row] = await db
        .select()
        .from(systemConfiguration)
        .where(eq(systemConfiguration.id, "site"));
      return row
        ? snapshot(row)
        : { values: { ...configurationDefaults }, revision: 0, updatedAt: null };
    },
    async update(values, revision, actorId) {
      if (audit && !audit.current())
        return audit.run(
          {
            action: "configuration.update",
            actorId,
            requestId: crypto.randomUUID(),
            source: "service",
          },
          async () => {
            const result = await createConfigurationRepository(db, audit).update(
              values,
              revision,
              actorId,
            );
            if (!result) await audit.fail("failed", "CONFIGURATION_CONFLICT");
            return result;
          },
        );
      const scope = audit?.current();
      if (scope) scope.mutationStarted = true;
      try {
        const result = await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(systemConfiguration)
            .where(eq(systemConfiguration.id, "site"))
            .for("update");
          // The insert and compare-and-swap update also protect the very first save.
          const rows =
            revision === 0
              ? await tx
                  .insert(systemConfiguration)
                  .values({ id: "site", ...values, revision: 1, updatedBy: actorId })
                  .onConflictDoNothing()
                  .returning()
              : await tx
                  .update(systemConfiguration)
                  .set({
                    ...values,
                    revision: revision + 1,
                    updatedBy: actorId,
                    updatedAt: sql`now()`,
                  })
                  .where(
                    and(
                      eq(systemConfiguration.id, "site"),
                      eq(systemConfiguration.revision, revision),
                    ),
                  )
                  .returning();
          if (rows[0] && scope)
            await writeAuditSuccess(tx, scope, {
              targetId: "site",
              before: before ? snapshot(before).values : { ...configurationDefaults },
              after: values,
            });
          return rows[0] ? snapshot(rows[0]) : null;
        });
        if (scope && result) scope.committed = true;
        return result;
      } catch (error) {
        await audit?.fail("failed", "CONFIGURATION_UNAVAILABLE");
        throw error;
      }
    },
  };
}
