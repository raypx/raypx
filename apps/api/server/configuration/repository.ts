import type { Database } from "@raypx/database/connection";
import { systemConfiguration } from "@raypx/database/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  configurationDefaults,
  configurationSnapshotSchema,
  type ConfigurationSnapshot,
} from "@raypx/contracts/api";
import type { ConfigurationRepository } from "./types.js";

export function createConfigurationRepository(db: Database): ConfigurationRepository {
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
      // The insert and compare-and-swap update also protect the very first save.
      const rows =
        revision === 0
          ? await db
              .insert(systemConfiguration)
              .values({ id: "site", ...values, revision: 1, updatedBy: actorId })
              .onConflictDoNothing()
              .returning()
          : await db
              .update(systemConfiguration)
              .set({ ...values, revision: revision + 1, updatedBy: actorId, updatedAt: sql`now()` })
              .where(
                and(eq(systemConfiguration.id, "site"), eq(systemConfiguration.revision, revision)),
              )
              .returning();
      return rows[0] ? snapshot(rows[0]) : null;
    },
  };
}
