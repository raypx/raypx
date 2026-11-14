import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { ProfileStorage } from "../../../../../src/runtime/sqlite/index.js";
import { desktopSessions } from "../../../../../src/runtime/sqlite/schema/desktop.js";
import {
  encryptedSessionStore,
  sessionRecordStore,
} from "../../../../../src/runtime/daemon/desktop/sessions.js";
import {
  SessionCookies,
  parseSessionCookie,
} from "../../../../../src/runtime/daemon/desktop/cookies.js";

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

it.each(["unchanged", "login", "logout"] as const)(
  "recovers a later key without resurrecting stale cookies after %s",
  (mode) => {
    const f = fixture();
    new SessionCookies(f.origin, f.store).apply([f.change]);
    const original = Buffer.from(f.records.read()!.encrypted);
    const jar = new SessionCookies(
      f.origin,
      encryptedSessionStore(f.records, f.directory, f.origin),
    );
    if (mode === "login")
      jar.apply([{ ...f.change, cookie: { ...f.change.cookie, value: "new-memory-login" } }]);
    if (mode === "logout") jar.apply([{ ...f.change, remove: true }]);
    jar.recover(encryptedSessionStore(f.records, f.directory, f.origin, randomBytes(32)));
    expect(jar.recovery).toBe("temporary");
    expect(f.records.read()!.encrypted).toEqual(original);
    jar.recover(f.store);
    expect(jar.recovery).toBeUndefined();
    const restored = new SessionCookies(f.origin, f.store).header(new URL(f.origin));
    const expected = {
      unchanged: "__Secure-better-auth.session_token=private-cookie",
      login: "__Secure-better-auth.session_token=new-memory-login",
      logout: "",
    };
    expect(restored).toBe(expected[mode]);
  },
);

it("resets sessions for all origins transactionally and rolls back a failed reset", () => {
  const f = fixture(),
    db = f.storage.database;
  f.records.write(Buffer.alloc(28, 1));
  const other = sessionRecordStore(db, "https://second.example.test");
  other.write(Buffer.alloc(28, 2));
  db.run(
    sql`CREATE TRIGGER reject_reset BEFORE DELETE ON desktop_sessions WHEN OLD.origin = 'https://second.example.test' BEGIN SELECT RAISE(ABORT, 'synthetic deletion failure'); END`,
  );
  expect(() => f.records.clear()).toThrow('Failed query: delete from "desktop_sessions"');
  expect(f.records.read()).toBeDefined();
  expect(other.read()).toBeDefined();
  db.run(sql`DROP TRIGGER reject_reset`);
  f.records.clear();
  expect(f.records.hasRows()).toBe(false);
});
