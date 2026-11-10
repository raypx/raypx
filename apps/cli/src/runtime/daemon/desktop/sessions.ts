import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { LocalDatabase } from "../../sqlite/index.ts";
import { desktopSessions } from "../../sqlite/schema/credentials.ts";
import { LocalError } from "../../errors.ts";
import { serverOrigin } from "../remote/origin.ts";
import { sessionLimit, type SessionStore } from "./cookies.ts";

export function sessionRecordStore(database: LocalDatabase, apiUrl: string) {
  const origin = serverOrigin(apiUrl);
  return {
    hasRows() {
      return (
        database.select({ origin: desktopSessions.origin }).from(desktopSessions).limit(1).get() !==
        undefined
      );
    },
    read() {
      return database
        .select()
        .from(desktopSessions)
        .where(eq(desktopSessions.origin, origin))
        .get();
    },
    write(encrypted: Buffer | undefined) {
      if (!encrypted) {
        database.delete(desktopSessions).where(eq(desktopSessions.origin, origin)).run();
        return;
      }
      database
        .insert(desktopSessions)
        .values({ origin, version: 1, encrypted })
        .onConflictDoUpdate({ target: desktopSessions.origin, set: { version: 1, encrypted } })
        .run();
    },
  };
}
export type SessionRecords = ReturnType<typeof sessionRecordStore>;

/** OS key arrives only over administrative IPC, never from the renderer. */
export function encryptedSessionStore(
  records: SessionRecords,
  profileDirectory: string,
  apiUrl: string,
  key?: Uint8Array,
): SessionStore {
  const aad = Buffer.from(
    JSON.stringify(["raypx-desktop-session", 1, profileDirectory, serverOrigin(apiUrl)]),
  );
  const unavailable = () => new LocalError("SESSION_KEY_UNAVAILABLE", "Session key unavailable");
  return {
    load() {
      const row = records.read();
      if (row && row.version !== 1)
        throw new LocalError("SESSION_VERSION_UNSUPPORTED", "Unsupported stored session version");
      if (!key || key.byteLength !== 32) throw unavailable();
      if (!row) return;
      if (row.encrypted.byteLength < 28 || row.encrypted.byteLength > sessionLimit + 28)
        throw unavailable();
      const nonce = row.encrypted.subarray(0, 12);
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(row.encrypted.subarray(-16));
      return Buffer.concat([decipher.update(row.encrypted.subarray(12, -16)), decipher.final()]);
    },
    save(value) {
      if (!key || key.byteLength !== 32) throw unavailable();
      if (!value) return records.write(undefined);
      if (value.byteLength > sessionLimit) throw unavailable();
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([
        nonce,
        cipher.update(value),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      records.write(encrypted);
    },
  };
}
