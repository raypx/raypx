import { expect, it } from "vite-plus/test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEncryptedCookies } from "../../native/cookies";
import { createDesktopApi } from "../../native/api";

it("encrypts native sessions, restores them, isolates origins, clears logout and rejects tampering", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-cookie-"));
  const secrets = new Map<string, string>();
  const keys = {
    get: async ({ name }: { name: string }) => secrets.get(name) ?? null,
    set: async ({ name, value, persist }: { name: string; value: string; persist: "local" }) => {
      expect(persist).toBe("local");
      secrets.set(name, value);
    },
  };
  try {
    const origin = "https://api.example.test";
    const cookies = await createEncryptedCookies(directory, origin, keys);
    const response = () =>
      Response.json(
        {},
        {
          headers: {
            "set-cookie":
              "__Secure-better-auth.session_token=synthetic-private-token; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=3600",
          },
        },
      );
    await createDesktopApi(origin, cookies, async () => response()).request({
      path: "/api/auth/sign-in/email",
      method: "POST",
      headers: {},
    });
    const encrypted = readFileSync(join(directory, "session.enc"));
    expect(encrypted.includes(Buffer.from("synthetic-private-token"))).toBe(false);
    const restored = await createEncryptedCookies(directory, origin, keys);
    expect(restored.get({ url: origin })[0]?.value).toBe("synthetic-private-token");
    const unavailableReports: unknown[] = [];
    const temporaryDuringOutage = await createEncryptedCookies(
      directory,
      origin,
      {
        get: async () => {
          throw new Error("Key service temporarily unavailable");
        },
        set: async () => {
          throw new Error("Key service temporarily unavailable");
        },
      },
      (value) => unavailableReports.push(value),
    );
    expect(temporaryDuringOutage.get({ url: origin })).toEqual([]);
    expect(unavailableReports).toMatchObject([{ kind: "temporary" }]);
    expect(readFileSync(join(directory, "session.enc"))).toEqual(encrypted);
    expect(
      (await createEncryptedCookies(directory, origin, keys)).get({ url: origin })[0]?.value,
    ).toBe("synthetic-private-token");
    expect(
      restored.set({
        name: "better-auth.ephemeral",
        value: "memory-only",
        domain: "api.example.test",
        path: "/",
        httpOnly: true,
        secure: true,
      }),
    ).toBe(true);
    expect(
      restored.get({ url: origin }).some((cookie) => cookie.name === "better-auth.ephemeral"),
    ).toBe(true);
    expect(
      (await createEncryptedCookies(directory, origin, keys))
        .get({ url: origin })
        .some((cookie) => cookie.name === "better-auth.ephemeral"),
    ).toBe(false);
    expect(restored.get({ url: "https://other.example.test" })).toEqual([]);
    expect(
      (
        await createEncryptedCookies(join(directory, "other"), "https://other.example.test", keys)
      ).get({ url: origin }),
    ).toEqual([]);
    expect(restored.remove(origin, "__Secure-better-auth.session_token")).toBe(true);
    expect((await createEncryptedCookies(directory, origin, keys)).get({ url: origin })).toEqual(
      [],
    );
    encrypted[encrypted.length - 1]! ^= 1;
    writeFileSync(join(directory, "session.enc"), encrypted);
    const recovery: { kind: string; path: string }[] = [];
    expect(
      (await createEncryptedCookies(directory, origin, keys, (value) => recovery.push(value))).get({
        url: origin,
      }),
    ).toEqual([]);
    expect(recovery).toMatchObject([{ kind: "reset" }]);
    expect(recovery[0]!.path).toContain("session.enc.corrupt-");
    expect(readFileSync(recovery[0]!.path)).toEqual(encrypted);
    expect(readdirSync(directory).some((file) => file.startsWith("session.enc.corrupt-"))).toBe(
      true,
    );
    writeFileSync(join(directory, "session.enc"), encrypted);
    secrets.clear();
    expect((await createEncryptedCookies(directory, origin, keys)).get({ url: origin })).toEqual(
      [],
    );
    for (const bytes of [Buffer.from([1, 2]), Buffer.from([99, ...Array(40).fill(0)])]) {
      writeFileSync(join(directory, "session.enc"), bytes);
      expect((await createEncryptedCookies(directory, origin, keys)).get({ url: origin })).toEqual(
        [],
      );
    }
    expect(
      readdirSync(directory).filter((file) => file.startsWith("session.enc.corrupt-")),
    ).toHaveLength(3);
    const old = join(directory, "session.enc.corrupt-00000000-0000-0000-0000-000000000000");
    writeFileSync(old, "old");
    const expired = new Date(Date.now() - 8 * 86400_000);
    utimesSync(old, expired, expired);
    await createEncryptedCookies(directory, origin, keys);
    expect(existsSync(old)).toBe(false);
    const temporary = await createEncryptedCookies(directory, origin, {
      get: async () => {
        throw new Error("Unavailable");
      },
      set: async () => {
        throw new Error("Unavailable");
      },
    });
    expect(
      temporary.set({
        name: "better-auth.session_token",
        value: "memory-only",
        domain: "api.example.test",
        path: "/",
        httpOnly: true,
        secure: true,
      }),
    ).toBe(true);
    expect(temporary.get({ url: origin })).toHaveLength(1);
    expect(existsSync(join(directory, "session.enc"))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
