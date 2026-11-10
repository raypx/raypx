import { afterEach, expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { ProfileStorage } from "../../../../../src/runtime/sqlite/index.ts";
import { desktopSessions } from "../../../../../src/runtime/sqlite/schema/credentials.ts";
import {
  encryptedSessionStore,
  sessionRecordStore,
} from "../../../../../src/runtime/daemon/desktop/sessions.ts";
import {
  SessionCookies,
  parseSessionCookie,
} from "../../../../../src/runtime/daemon/desktop/cookies.ts";

const profiles: { directory: string; storage: ProfileStorage }[] = [];
afterEach(() => {
  for (const { storage, directory } of profiles.splice(0)) {
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-desktop-sessions-"));
  const storage = new ProfileStorage(directory);
  profiles.push({ directory, storage });
  const origin = "https://api.example.test";
  const key = randomBytes(32);
  const records = sessionRecordStore(storage.database, origin);
  const store = encryptedSessionStore(records, directory, origin, key);
  const change = parseSessionCookie(
    new URL(origin),
    "__Secure-better-auth.session_token=private-cookie; Secure; HttpOnly; Path=/; Max-Age=3600",
  )!;
  return { directory, storage, origin, key, records, store, change };
}

it("encrypts durable sessions in the existing profile writer and restores them after reopen", () => {
  const { directory, storage, origin, key, records, store, change } = fixture();
  const jar = new SessionCookies(origin, store);
  jar.apply([change]);
  expect(records.read()?.encrypted.toString()).not.toContain("private-cookie");
  storage.close();
  const reopened = new ProfileStorage(directory);
  try {
    const restored = new SessionCookies(
      origin,
      encryptedSessionStore(sessionRecordStore(reopened.database, origin), directory, origin, key),
    );
    expect(restored.header(new URL(origin))).toBe(
      "__Secure-better-auth.session_token=private-cookie",
    );
    restored.apply([{ ...change, remove: true }]);
    expect(sessionRecordStore(reopened.database, origin).read()).toBeUndefined();
  } finally {
    reopened.close();
  }
});

it("binds ciphertext to key, profile and exact server and preserves rows on every unavailable-key path", () => {
  const { directory, origin, key, records, store, change } = fixture();
  new SessionCookies(origin, store).apply([change]);
  const encrypted = Buffer.from(records.read()!.encrypted);
  for (const badStore of [
    encryptedSessionStore(records, directory, origin),
    encryptedSessionStore(records, directory, origin, randomBytes(32)),
    encryptedSessionStore(records, directory + "-other", origin, key),
    encryptedSessionStore(records, directory, "https://other.example.test", key),
  ]) {
    const jar = new SessionCookies(origin, badStore);
    expect(jar.recovery).toBe("temporary");
    jar.apply([change]);
    expect(records.read()!.encrypted).toEqual(encrypted);
  }
  const corrupted = Buffer.from(encrypted);
  corrupted[13] = corrupted[13]! ^ 0xff;
  records.write(corrupted);
  const jar = new SessionCookies(origin, store);
  expect(jar.recovery).toBe("temporary");
  jar.apply([change]);
  expect(records.read()!.encrypted).toEqual(corrupted);
});

it("rejects an unsupported session version without deleting or downgrading the row", () => {
  const { storage, records, origin, store, change } = fixture();
  new SessionCookies(origin, store).apply([change]);
  storage.database
    .update(desktopSessions)
    .set({ version: 2 })
    .where(eq(desktopSessions.origin, origin))
    .run();
  expect(() => new SessionCookies(origin, store)).toThrow("Unsupported");
  expect(records.read()?.version).toBe(2);
});

it("poisons the cookie transport when SQLite rejects a durable update, preserving the previous ciphertext", () => {
  const { storage, records, origin, store, change } = fixture();
  const jar = new SessionCookies(origin, store);
  jar.apply([change]);
  const previous = Buffer.from(records.read()!.encrypted);
  storage.database.run(
    sql`CREATE TRIGGER reject_desktop_sessions BEFORE UPDATE ON desktop_sessions BEGIN SELECT RAISE(ABORT, 'test failure'); END`,
  );
  expect(() =>
    jar.apply([{ ...change, cookie: { ...change.cookie, value: "replacement" } }]),
  ).toThrow("restart required");
  expect(() => jar.header(new URL(origin))).toThrow("restart required");
  expect(records.read()!.encrypted).toEqual(previous);
});
