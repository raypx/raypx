import { expect, it } from "vite-plus/test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, type AuthMailInput } from "../src/server.js";

interface SessionResponse {
  session: { id: string; token: string; userId: string };
  user: { id: string; email: string; name: string; emailVerified: boolean };
}

function fixture() {
  const baseURL = "http://localhost:3002";
  const password = "account-security-password-123";
  const verificationEmails: AuthMailInput[] = [];
  const auth = createAuth({
    database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
    mailer: {
      sendVerification: async (input) => {
        verificationEmails.push(input);
      },
      sendPasswordReset: async () => {},
    },
    config: {
      baseURL,
      secret: "account-security-test-secret-at-least-32-characters",
      trustedOrigins: [],
      production: false,
    },
  });
  const get = (path: string, cookie = "") =>
    auth.handler(new Request(`${baseURL}/api/auth/${path}`, { headers: { cookie } }));
  const post = (path: string, body: object, cookie = "") =>
    auth.handler(
      new Request(`${baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseURL, cookie },
        body: JSON.stringify(body),
      }),
    );
  const session = async (cookie: string): Promise<SessionResponse | null> => {
    const response = await get("get-session", cookie);
    expect(response.status).toBe(200);
    return response.json();
  };
  const register = async (email: string, name: string) => {
    expect((await post("sign-up/email", { email, name, password })).status).toBe(200);
    const verification = verificationEmails.find((input) => input.email === email);
    expect(verification).toBeDefined();
    expect((await post("sign-in/email", { email, password })).status).toBe(403);
    const response = await auth.handler(new Request(verification!.url));
    expect([200, 302]).toContain(response.status);
  };
  const signIn = async (email: string) => {
    const response = await post("sign-in/email", { email, password });
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cookie).toContain("session_token");
    const current = await session(cookie);
    expect(current?.user.email).toBe(email);
    return { cookie, ...current! };
  };
  const sessions = async (cookie: string): Promise<SessionResponse["session"][]> => {
    const response = await get("list-sessions", cookie);
    expect(response.status).toBe(200);
    return response.json();
  };
  return { get, post, session, sessions, register, signIn };
}

it("persists a display name across sessions without changing another account", async () => {
  const app = fixture();
  await app.register("owner@example.com", "Original Name");
  await app.register("other@example.com", "Other Account");
  const current = await app.signIn("owner@example.com");
  const otherDevice = await app.signIn("owner@example.com");
  const otherAccount = await app.signIn("other@example.com");

  const updated = await app.post("update-user", { name: "新的显示名称" }, current.cookie);
  expect(updated.status).toBe(200);
  expect(await updated.json()).toEqual({ status: true });
  for (const cookie of [current.cookie, otherDevice.cookie]) {
    expect((await app.session(cookie))?.user).toMatchObject({
      id: current.user.id,
      email: "owner@example.com",
      emailVerified: true,
      name: "新的显示名称",
    });
  }
  expect((await app.session(otherAccount.cookie))?.user.name).toBe("Other Account");
}, 30000);

it("isolates session ownership and immediately revokes individual and other sessions", async () => {
  const app = fixture();
  await app.register("owner@example.com", "Owner");
  await app.register("other@example.com", "Other");
  const current = await app.signIn("owner@example.com");
  const second = await app.signIn("owner@example.com");
  const third = await app.signIn("owner@example.com");
  const otherAccount = await app.signIn("other@example.com");

  const listed = await app.sessions(current.cookie);
  expect(listed.map((value) => value.id).sort()).toEqual(
    [current.session.id, second.session.id, third.session.id].sort(),
  );
  expect(listed.every((value) => value.userId === current.user.id)).toBe(true);

  // An authenticated caller must not revoke another account even with its token.
  const foreign = await app.post(
    "revoke-session",
    { token: otherAccount.session.token },
    current.cookie,
  );
  expect(foreign.status).toBe(200);
  expect((await app.session(otherAccount.cookie))?.session.id).toBe(otherAccount.session.id);
  expect(await app.sessions(current.cookie)).toHaveLength(3);

  const revoked = await app.post("revoke-session", { token: second.session.token }, current.cookie);
  expect(revoked.status).toBe(200);
  expect(await revoked.json()).toEqual({ status: true });
  expect(await app.session(second.cookie)).toBeNull();
  expect((await app.get("list-sessions", second.cookie)).status).toBe(401);
  expect((await app.session(current.cookie))?.session.id).toBe(current.session.id);
  expect((await app.session(third.cookie))?.session.id).toBe(third.session.id);

  const bulk = await app.post("revoke-other-sessions", {}, current.cookie);
  expect(bulk.status).toBe(200);
  expect(await bulk.json()).toEqual({ status: true });
  expect(await app.session(second.cookie)).toBeNull();
  expect(await app.session(third.cookie)).toBeNull();
  expect((await app.session(current.cookie))?.session.id).toBe(current.session.id);
  expect((await app.sessions(current.cookie)).map((value) => value.id)).toEqual([
    current.session.id,
  ]);
  expect((await app.session(otherAccount.cookie))?.session.id).toBe(otherAccount.session.id);
}, 30000);

it.each([
  { path: "list-sessions", method: "GET", body: {} },
  { path: "revoke-session", method: "POST", body: { token: "unknown-session" } },
  { path: "revoke-other-sessions", method: "POST", body: {} },
  { path: "update-user", method: "POST", body: { name: "Anonymous" } },
])("rejects anonymous $method /$path", async ({ path, method, body }) => {
  const app = fixture();
  const response = method === "GET" ? await app.get(path) : await app.post(path, body);
  expect(response.status).toBe(401);
});
