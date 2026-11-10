import { expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileStorage } from "../../../../../src/runtime/sqlite/index.ts";
import { DesktopApi } from "../../../../../src/runtime/daemon/desktop/api.ts";
import { SessionCookies } from "../../../../../src/runtime/daemon/desktop/cookies.ts";
import {
  encryptedSessionStore,
  sessionRecordStore,
} from "../../../../../src/runtime/daemon/desktop/sessions.ts";

it("persists Secure/HttpOnly sessions over real HTTPS, restores them and deletes them on sign-out", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-desktop-https-"));
  const storage = new ProfileStorage(directory);
  const received: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls: {
      key: Bun.file(join(import.meta.dirname, "../../../../fixtures/desktop/https-key.pem")),
      cert: Bun.file(join(import.meta.dirname, "../../../../fixtures/desktop/https-cert.pem")),
    },
    fetch(request) {
      received.push(request.headers.get("cookie") ?? "");
      expect(request.headers.get("origin")).toBe("views://main");
      const path = new URL(request.url).pathname;
      if (path === "/api/auth/sign-out")
        return Response.json(
          { success: true },
          {
            headers: {
              "set-cookie":
                "__Secure-better-auth.session_token=; Secure; HttpOnly; Path=/; Max-Age=0",
            },
          },
        );
      if (path === "/api/auth/sign-in/email")
        return Response.json(
          { token: "private-token", user: { id: "owner" } },
          {
            headers: {
              "set-cookie":
                "__Secure-better-auth.session_token=private-https-cookie; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600",
            },
          },
        );
      return Response.json({
        session: { id: "public-session", token: "private-token" },
        user: { id: "owner" },
      });
    },
  });
  const origin = `https://127.0.0.1:${server.port}`;
  const key = Buffer.alloc(32, 5);
  const records = sessionRecordStore(storage.database, origin);
  const store = encryptedSessionStore(records, directory, origin, key);
  const input = (path: string) => ({
    path,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const signal = new AbortController().signal;
  const testFetch = (request: Request) =>
    fetch(request, { tls: { rejectUnauthorized: false }, proxy: false, redirect: "manual" });
  try {
    const production = new DesktopApi(new SessionCookies(origin, store));
    await expect(
      production.request(input("/api/auth/get-session"), "page", signal),
    ).rejects.toMatchObject({ code: "API_UNAVAILABLE" });
    const api = new DesktopApi(new SessionCookies(origin, store), testFetch);
    const response = await api.request(input("/api/auth/sign-in/email"), "page", signal);
    expect(JSON.stringify(response)).not.toContain("private-");
    expect(records.read()!.encrypted.toString()).not.toContain("private-https-cookie");
    const restored = new DesktopApi(new SessionCookies(origin, store), testFetch);
    const session = await restored.request(input("/api/auth/get-session"), "replacement", signal);
    expect(JSON.parse(session.body)).toEqual({
      session: { id: "public-session" },
      user: { id: "owner" },
    });
    expect(received.at(-1)).toBe("__Secure-better-auth.session_token=private-https-cookie");
    await restored.request(input("/api/auth/sign-out"), "replacement", signal);
    expect(records.read()).toBeUndefined();
    await restored.request(input("/api/auth/get-session"), "replacement", signal);
    expect(received.at(-1)).toBe("");
  } finally {
    await server.stop(true);
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
