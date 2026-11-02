import { expect, it } from "vite-plus/test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, readAuthSession } from "../src/server.js";
import { accountRoles, assignedRoles, permissionsForRoles } from "../src/access.js";

function fixture() {
  const data: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const cache = new Map<string, string>();
  const baseURL = "http://localhost:3002";
  const auth = createAuth({
    database: memoryAdapter(data),
    secondaryStorage: {
      get: async (key) => cache.get(key) ?? null,
      set: async (key, value) => {
        cache.set(key, value);
      },
      delete: async (key) => {
        cache.delete(key);
      },
      getAndDelete: async (key) => {
        const value = cache.get(key) ?? null;
        cache.delete(key);
        return value;
      },
      increment: async (key) => {
        const value = Number(cache.get(key) ?? 0) + 1;
        cache.set(key, String(value));
        return value;
      },
    },
    config: {
      baseURL,
      secret: "role-test-secret-with-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      production: false,
    },
    mailer: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
  });
  const post = (path: string, body: object, cookie = "", origin: string | null = baseURL) =>
    auth.handler(
      new Request(`${baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, ...(origin ? { origin } : {}) },
        body: JSON.stringify(body),
      }),
    );
  const register = async (email: string) => {
    expect(
      (
        await post("sign-up/email", {
          email,
          name: "User",
          password: "role-test-password-123",
          role: "admin",
        })
      ).status,
    ).toBe(400);
    expect(
      (await post("sign-up/email", { email, name: "User", password: "role-test-password-123" }))
        .status,
    ).toBe(200);
    const user = data.user!.find((candidate) => candidate.email === email)!;
    expect(user.role).toBe("member");
    user.emailVerified = true;
    return user;
  };
  const signIn = async (email: string) => {
    const response = await post("sign-in/email", { email, password: "role-test-password-123" });
    expect(response.status).toBe(200);
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  };
  return { auth, data, post, register, signIn };
}

it("uses Better Auth role mutations and its ACL for application grants without self-elevation", async () => {
  const f = fixture();
  const admin = await f.register("admin@example.test"),
    member = await f.register("member@example.test");
  await (await f.auth.$context).internalAdapter.updateUser(String(admin.id), { role: "admin" });
  const adminCookie = await f.signIn("admin@example.test"),
    memberCookie = await f.signIn("member@example.test");
  expect(
    await f.auth.api.userHasPermission({
      body: { role: "admin", permissions: { raypx: ["configuration.read"] } },
    }),
  ).toMatchObject({ success: true });
  expect(
    (await f.post("admin/set-role", { userId: member.id, role: "admin" }, memberCookie)).status,
  ).toBe(403);
  await f.post("update-user", { name: "Updated", role: "admin" }, memberCookie);
  expect((await readAuthSession(f.auth, new Headers({ cookie: memberCookie })))?.user.role).toBe(
    "member",
  );
  for (const origin of [null, "https://untrusted.test"])
    expect(
      (await f.post("admin/set-role", { userId: member.id, role: "admin" }, adminCookie, origin))
        .status,
    ).toBe(403);
  expect(
    (await f.post("admin/set-role", { userId: member.id, role: "unknown" }, adminCookie)).status,
  ).toBe(400);
  expect(
    (await f.post("admin/set-role", { userId: member.id, role: ["member", "admin"] }, adminCookie))
      .status,
  ).toBe(200);
  const promoted = await readAuthSession(f.auth, new Headers({ cookie: memberCookie }));
  expect(promoted?.user.role).toBe("member,admin");
  expect(permissionsForRoles(assignedRoles(promoted?.user.role))).toContain("configuration.update");
  expect(accountRoles.admin.authorize({ user: ["impersonate"] }).success).toBe(false);
  expect((await f.post("admin/impersonate-user", { userId: member.id }, adminCookie)).status).toBe(
    403,
  );
  expect(
    (await f.post("admin/set-role", { userId: member.id, role: "member" }, adminCookie)).status,
  ).toBe(200);
  expect((await readAuthSession(f.auth, new Headers({ cookie: memberCookie })))?.user.role).toBe(
    "member",
  );
}, 30_000);

it("reads authoritative roles and bans even when secondary storage retains an administrator session", async () => {
  const f = fixture();
  const user = await f.register("cached@example.test");
  user.role = "admin";
  const cookie = await f.signIn("cached@example.test"),
    headers = new Headers({ cookie });
  // Simulate an out-of-process update whose session-cache refresh failed.
  user.role = "member";
  expect((await f.auth.api.getSession({ headers }))?.user.role).toBe("admin");
  expect((await readAuthSession(f.auth, headers))?.user.role).toBe("member");
  const permission = await f.post(
    "admin/has-permission",
    { permissions: { raypx: ["configuration.read"] } },
    cookie,
  );
  expect(await permission.json()).toEqual({ error: null, success: false });
  expect((await f.post("admin/set-role", { userId: user.id, role: "admin" }, cookie)).status).toBe(
    403,
  );
  user.banned = true;
  expect(await readAuthSession(f.auth, headers)).toBeNull();
  expect((await f.post("admin/set-role", { userId: user.id, role: "admin" }, cookie)).status).toBe(
    403,
  );
}, 30_000);
