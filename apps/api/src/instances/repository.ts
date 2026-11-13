import { eq, lt, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { runtimeInstance, instanceEnrollment } from "@raypx/database/schema";
import { instanceBindingSchema } from "@raypx/instances";
import { enrollmentRecordSchema, type InstanceRepository } from "@raypx/instances/server";
export function createInstanceRepository(db: Database): InstanceRepository {
  return {
    transaction: (key, run) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`instance:${key}`}, 0))`,
        );
        return run({
          enrollment: async (id) => {
            const [row] = await tx
              .select()
              .from(instanceEnrollment)
              .where(eq(instanceEnrollment.id, id));
            return row ? enrollmentRecordSchema.parse(row.body) : undefined;
          },
          saveEnrollment: async (value) => {
            await tx.delete(instanceEnrollment).where(lt(instanceEnrollment.expiresAt, new Date()));
            await tx
              .insert(instanceEnrollment)
              .values({
                id: value.id,
                codeHash: value.codeHash,
                expiresAt: new Date(value.expiresAt),
                body: value,
              })
              .onConflictDoUpdate({ target: instanceEnrollment.id, set: { body: value } });
          },
          instance: async (id) => {
            const [row] = await tx.select().from(runtimeInstance).where(eq(runtimeInstance.id, id));
            return row ? instanceBindingSchema.parse(row.body) : undefined;
          },
          saveInstance: async (value) => {
            await tx
              .insert(runtimeInstance)
              .values({ id: value.instanceId, userId: value.accountId, body: value })
              .onConflictDoUpdate({ target: runtimeInstance.id, set: { body: value } });
          },
        });
      }),
    findCode: async (hash) => {
      const [row] = await db
        .select()
        .from(instanceEnrollment)
        .where(eq(instanceEnrollment.codeHash, hash));
      return row ? enrollmentRecordSchema.parse(row.body) : undefined;
    },
    list: async (accountId) =>
      (
        await db
          .select()
          .from(runtimeInstance)
          .where(eq(runtimeInstance.userId, accountId))
          .orderBy(runtimeInstance.id)
          .limit(100)
      ).map((row) => instanceBindingSchema.parse(row.body)),
  };
}
