import { eq } from "drizzle-orm";
import { InstanceError } from "@raypx/instances";
import type { LocalDatabase } from "../sqlite/index.ts";
import { instanceCredentials } from "../sqlite/schema/credentials.ts";
import type { InstanceKeyStore } from "./index.ts";

/** Borrows the profile writer. A receipt without this key never creates a new identity. */
export function instanceKeys(database: LocalDatabase): InstanceKeyStore {
  return {
    async get(id) {
      try {
        const row = database
          .select()
          .from(instanceCredentials)
          .where(eq(instanceCredentials.instanceId, id))
          .get();
        return row?.privateKey.toString("base64");
      } catch {
        throw new InstanceError("INSTANCE_KEY_UNAVAILABLE");
      }
    },
    async set(id, key) {
      const privateKey = Buffer.from(key, "base64");
      try {
        database.transaction((tx) => {
          tx.insert(instanceCredentials)
            .values({ instanceId: id, privateKey })
            .onConflictDoNothing()
            .run();
          const row = tx
            .select()
            .from(instanceCredentials)
            .where(eq(instanceCredentials.instanceId, id))
            .get();
          if (!row?.privateKey.equals(privateKey))
            throw new InstanceError("INSTANCE_KEY_UNAVAILABLE");
        });
      } catch {
        // Drizzle errors may include bound values; never forward the original error.
        throw new InstanceError("INSTANCE_KEY_UNAVAILABLE");
      }
    },
  };
}
