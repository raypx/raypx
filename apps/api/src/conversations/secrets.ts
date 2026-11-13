import { and, eq } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { modelConnectionSecrets } from "@raypx/database/schema";
import { sealStoredSecret, openStoredSecret } from "./secret-envelope.js";
export {
  applicationSecretKeyProvider,
  sealStoredSecret,
  openStoredSecret,
} from "./secret-envelope.js";

import type { SecretKeyProvider, SecretStore } from "./secret-types.js";
export type {
  WrappedDataKey,
  SecretKeyProvider,
  SealedSecret,
  SecretStore,
} from "./secret-types.js";

/** Construction is pure; writes are performed atomically by the connection repository. */
export function createPostgresSecretStore(db: Database, keys: SecretKeyProvider): SecretStore {
  function selection(accountId: string, connectionId: string, secretId: string) {
    return and(
      eq(modelConnectionSecrets.accountId, accountId),
      eq(modelConnectionSecrets.connectionId, connectionId),
      eq(modelConnectionSecrets.id, secretId),
    );
  }
  return {
    seal: (accountId, secretId, value) => sealStoredSecret(keys, accountId, secretId, value),
    async read(accountId, connectionId, secretId) {
      const [row] = await db
        .select()
        .from(modelConnectionSecrets)
        .where(selection(accountId, connectionId, secretId))
        .limit(1);
      if (!row) throw new Error("SECRET_UNAVAILABLE");
      return openStoredSecret(keys, accountId, secretId, row);
    },
    async rewrap(accountId, connectionId, secretId, next) {
      try {
        await db.transaction(async (tx) => {
          const where = selection(accountId, connectionId, secretId);
          const [row] = await tx.select().from(modelConnectionSecrets).where(where).for("update");
          if (!row) throw new Error();
          const binding = JSON.stringify([accountId, secretId]);
          const dataKey = await keys.unwrap(row, binding);
          await tx
            .update(modelConnectionSecrets)
            .set({ ...(await next.wrap(dataKey, binding)), updatedAt: new Date() })
            .where(where);
        });
      } catch {
        throw new Error("SECRET_UNAVAILABLE");
      }
    },
  };
}
