import { and, eq } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { modelConnectionSecrets } from "@raypx/database/schema";
import { configurationCipher } from "../config/credentials.js";

import type { SecretKeyProvider, SecretStore } from "./secret-types.js";
export type {
  WrappedDataKey,
  SecretKeyProvider,
  SealedSecret,
  SecretStore,
} from "./secret-types.js";

/** Uses the configuration center's APP_KEY/HKDF/AES-GCM mechanism to wrap data keys. */
export function applicationSecretKeyProvider(applicationKey: string): SecretKeyProvider {
  const cipher = configurationCipher(applicationKey, "model-connection-data-key-v1", "application");
  return {
    async wrap(dataKey, binding) {
      return { keyId: "application-v1", wrappedDataKey: await cipher.seal(dataKey, binding) };
    },
    async unwrap(key, binding) {
      if (key.keyId !== "application-v1") throw new Error("SECRET_UNAVAILABLE");
      return cipher.open(key.wrappedDataKey, binding);
    },
  };
}

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
    async seal(accountId, secretId, value) {
      const binding = JSON.stringify([accountId, secretId]);
      const dataKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
      return {
        ...(await keys.wrap(dataKey, binding)),
        ciphertext: await configurationCipher(dataKey, "model-connection-value-v1", secretId).seal(
          value,
          binding,
        ),
      };
    },
    async read(accountId, connectionId, secretId) {
      const [row] = await db
        .select()
        .from(modelConnectionSecrets)
        .where(selection(accountId, connectionId, secretId))
        .limit(1);
      if (!row) throw new Error("SECRET_UNAVAILABLE");
      try {
        const binding = JSON.stringify([accountId, secretId]);
        const dataKey = await keys.unwrap(row, binding);
        return await configurationCipher(dataKey, "model-connection-value-v1", secretId).open(
          row.ciphertext,
          binding,
        );
      } catch {
        // Key-service and crypto failures must never attach their input or cause.
        throw new Error("SECRET_UNAVAILABLE");
      }
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
