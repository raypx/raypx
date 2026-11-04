import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { LocalDatabase } from "../sqlite";
import { hostAuthorizations } from "../sqlite/schema/credentials";
import { LocalError } from "../errors";
import { z } from "zod";
import { hostAuthorizationSchema, type HostAuthorization } from "@raypx/contracts/terminal";

export const hostBindingSchema = z.object({
  accountId: z.string().min(1).max(200),
  apiUrl: z.string().max(2048),
  deviceId: z.string().uuid(),
  epoch: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});
export type HostBinding = z.infer<typeof hostBindingSchema>;
export const bindingKey = (apiUrl: string, accountId: string) =>
  createHash("sha256")
    .update(JSON.stringify([apiUrl, accountId]))
    .digest("hex");
export interface HostVault {
  get(binding: HostBinding): Promise<HostAuthorization | undefined>;
  set(binding: HostBinding, value: HostAuthorization): Promise<boolean>;
  remove(binding: HostBinding): Promise<void>;
}
/** Borrows ProfileStorage; SQLite transactions are the only persistence boundary. */
export function createHostVault(database: LocalDatabase): HostVault {
  const memory = new Map<string, HostAuthorization>();
  const name = (binding: HostBinding) =>
    JSON.stringify([binding.apiUrl, binding.accountId, binding.deviceId, binding.epoch]);
  const where = (binding: HostBinding) =>
    and(
      eq(hostAuthorizations.apiUrl, binding.apiUrl),
      eq(hostAuthorizations.accountId, binding.accountId),
      eq(hostAuthorizations.deviceId, binding.deviceId),
      eq(hostAuthorizations.epoch, binding.epoch),
    );
  const valid = (binding: HostBinding, value: HostAuthorization) =>
    value.accountId === binding.accountId &&
    value.deviceId === binding.deviceId &&
    value.epoch === binding.epoch &&
    value.expiresAt === binding.expiresAt;
  return {
    async get(binding) {
      const key = name(binding),
        cached = memory.get(key);
      if (cached && valid(binding, cached)) return structuredClone(cached);
      try {
        const row = database.select().from(hostAuthorizations).where(where(binding)).get();
        if (!row) return;
        const value = hostAuthorizationSchema.parse(JSON.parse(row.authorization));
        if (valid(binding, value)) return value;
      } catch {
        // An unavailable credential requires explicit reauthorization.
      }
    },
    async set(binding, value) {
      hostBindingSchema.parse(binding);
      const parsed = hostAuthorizationSchema.parse(value);
      if (!valid(binding, parsed)) throw new Error("Invalid host authorization binding");
      const key = name(binding);
      try {
        database.transaction((tx) => {
          tx.insert(hostAuthorizations)
            .values({
              apiUrl: binding.apiUrl,
              accountId: binding.accountId,
              deviceId: binding.deviceId,
              epoch: binding.epoch,
              authorization: JSON.stringify(parsed),
            })
            .onConflictDoUpdate({
              target: [
                hostAuthorizations.apiUrl,
                hostAuthorizations.accountId,
                hostAuthorizations.deviceId,
                hostAuthorizations.epoch,
              ],
              set: { authorization: JSON.stringify(parsed) },
            })
            .run();
        });
        memory.delete(key);
        return true;
      } catch {
        memory.set(key, structuredClone(parsed));
        return false;
      }
    },
    async remove(binding) {
      memory.delete(name(binding));
      // Report a failed local deletion; callers must not claim it was persisted.
      try {
        database.delete(hostAuthorizations).where(where(binding)).run();
      } catch {
        throw new LocalError("HOST_CREDENTIAL_UNAVAILABLE", "Unable to remove host authorization");
      }
    },
  };
}
