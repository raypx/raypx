import { expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    await expect(
      createEncryptedCookies(directory, "https://other.example.test", keys),
    ).rejects.toThrow("Native session authentication failed");
    expect(restored.remove(origin, "__Secure-better-auth.session_token")).toBe(true);
    expect((await createEncryptedCookies(directory, origin, keys)).get({ url: origin })).toEqual(
      [],
    );
    encrypted[encrypted.length - 1]! ^= 1;
    writeFileSync(join(directory, "session.enc"), encrypted);
    await expect(createEncryptedCookies(directory, origin, keys)).rejects.toThrow(
      "Native session authentication failed",
    );
    secrets.clear();
    await expect(createEncryptedCookies(directory, origin, keys)).rejects.toThrow(
      "key unavailable",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
