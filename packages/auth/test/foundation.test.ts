import { afterEach, expect, test, vi } from "vite-plus/test";
import { createDatabase, eq, runMigrations, type DatabaseConnection } from "@raypx/db";
import { account, session as sessionTable, user } from "@raypx/db/schema";
import {
  auth,
  configureAuth,
  createAuth,
  getAuth,
  getSession,
  requireAuth,
  type AuthInstance,
} from "../src/index.js";

const connections: DatabaseConnection[] = [];
const origin = "http://localhost:3000";
const secret = "test-only-secret-with-at-least-32-characters";
const password = "Testing-a-strong-password-123!";

afterEach(() => {
  vi.unstubAllEnvs();
  configureAuth(undefined);
  for (const connection of connections.splice(0)) connection.close();
});

function instance() {
  const connection = createDatabase(":memory:");
  connections.push(connection);
  runMigrations(connection.db);
  return {
    connection,
    instance: createAuth({ database: connection.db, secret, baseURL: origin, environment: "test" }),
  };
}

function post(
  instance: AuthInstance,
  path: string,
  body: unknown,
  cookie?: string,
  requestOrigin = origin,
) {
  return instance.handler(
    new Request(`${origin}/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: requestOrigin,
        "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site",
        "sec-fetch-mode": "cors",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

function cookie(response: Response): string {
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .filter((value): value is string => !!value);
  expect(cookies.length).toBeGreaterThan(0);
  return cookies.join("; ");
}

function sessionRequest(value?: string): Request {
  return new Request(`${origin}/api/session`, { headers: value ? { cookie: value } : {} });
}

test("email registration, login and logout use real SQLite and immediately revoke old cookies", async () => {
  const { connection, instance: authInstance } = instance();
  const signUp = await post(authInstance, "sign-up/email", {
    name: "Person",
    email: "person@example.com",
    password,
  });
  expect(signUp.status).toBe(200);
  const signedUpCookie = cookie(signUp);
  const signedUp = await getSession(sessionRequest(signedUpCookie), authInstance);
  expect(signedUp?.user.email).toBe("person@example.com");
  expect(signedUp?.user.emailVerified).toBe(false);
  const credentials = connection.db.select().from(account).get();
  expect(credentials?.providerId).toBe("credential");
  expect(credentials?.password).toBeTruthy();
  expect(credentials?.password).not.toBe(password);
  expect(JSON.stringify(signedUp)).not.toContain(password);
  expect(JSON.stringify(signedUp)).not.toContain(credentials?.password);

  const login = await post(authInstance, "sign-in/email", {
    email: "person@example.com",
    password,
  });
  expect(login.status).toBe(200);
  const loggedInCookie = cookie(login);
  const authorized = await requireAuth(sessionRequest(loggedInCookie), authInstance);
  expect(authorized).not.toBeInstanceOf(Response);
  const logout = await post(authInstance, "sign-out", {}, loggedInCookie);
  expect(logout.status).toBe(200);
  expect(await getSession(sessionRequest(loggedInCookie), authInstance)).toBeNull();
  expect(await getSession(sessionRequest(signedUpCookie), authInstance)).not.toBeNull();
  const revoked = await requireAuth(sessionRequest(loggedInCookie), authInstance);
  expect(revoked).toBeInstanceOf(Response);
  if (!(revoked instanceof Response)) throw new Error("Expected unauthorized response");
  expect(revoked.status).toBe(401);
});

test("invalid email and password cannot create records; wrong credentials and untrusted origins fail", async () => {
  const { connection, instance: authInstance } = instance();
  expect(
    (await post(authInstance, "sign-up/email", { name: "Invalid", email: "invalid", password }))
      .status,
  ).toBe(400);
  expect(
    (
      await post(authInstance, "sign-up/email", {
        name: "Weak",
        email: "weak@example.com",
        password: "short",
      })
    ).status,
  ).toBe(400);
  expect(connection.db.select().from(user).all()).toEqual([]);
  expect(connection.db.select().from(account).all()).toEqual([]);
  expect(
    (
      await post(authInstance, "sign-up/email", {
        name: "Person",
        email: "person@example.com",
        password,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post(authInstance, "sign-in/email", {
        email: "person@example.com",
        password: "wrong-password",
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await post(
        authInstance,
        "sign-up/email",
        { name: "Blocked", email: "blocked@example.com", password },
        undefined,
        "https://untrusted.example",
      )
    ).status,
  ).toBe(403);
  expect(connection.db.select().from(user).all()).toHaveLength(1);
});

test("missing, tampered, expired and externally revoked sessions are unauthorized", async () => {
  const { connection, instance: authInstance } = instance();
  expect(await getSession(sessionRequest(), authInstance)).toBeNull();
  expect(
    await getSession(sessionRequest("better-auth.session_token=invalid"), authInstance),
  ).toBeNull();
  const signup = await post(authInstance, "sign-up/email", {
    name: "Person",
    email: "person@example.com",
    password,
  });
  const value = cookie(signup);
  connection.db
    .update(sessionTable)
    .set({ expiresAt: new Date(0) })
    .run();
  expect(await getSession(sessionRequest(value), authInstance)).toBeNull();
  const login = await post(authInstance, "sign-in/email", {
    email: "person@example.com",
    password,
  });
  const loginCookie = cookie(login);
  const current = await getSession(sessionRequest(loginCookie), authInstance);
  expect(current).not.toBeNull();
  if (!current) throw new Error("Expected active session");
  connection.db.delete(sessionTable).where(eq(sessionTable.id, current.session.id)).run();
  expect(await getSession(sessionRequest(loginCookie), authInstance)).toBeNull();
});

test("independent auth instances cannot access each other's sessions or users", async () => {
  const first = instance();
  const second = instance();
  const signup = await post(first.instance, "sign-up/email", {
    name: "First",
    email: "first@example.com",
    password,
  });
  const value = cookie(signup);
  expect(await getSession(sessionRequest(value), first.instance)).not.toBeNull();
  expect(await getSession(sessionRequest(value), second.instance)).toBeNull();
  expect(second.connection.db.select().from(user).all()).toEqual([]);
});

test("compatibility helpers require explicit configuration and facades follow the configured instance", async () => {
  expect(() => getAuth()).toThrow(/not configured/);
  expect(() => auth.api).toThrow(/not configured/);
  await expect(getSession(sessionRequest())).rejects.toThrow(/not configured/);
  const { instance: authInstance } = instance();
  configureAuth(authInstance);
  expect(getAuth()).toBe(authInstance);
  expect(auth.api).toBe(authInstance.api);
  expect(await getSession(sessionRequest())).toBeNull();
  const request = new Request(`${origin}/api/session`, {
    headers: { "x-request-id": "request-123" },
  });
  const unauthorized = await requireAuth(request);
  if (!(unauthorized instanceof Response)) throw new Error("Expected unauthorized response");
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toEqual({
    error: { code: "UNAUTHORIZED", message: "Authentication required", requestId: "request-123" },
  });
  const invalidId = await requireAuth(
    new Request(`${origin}/api/session`, { headers: { "x-request-id": "not a valid id" } }),
  );
  if (!(invalidId instanceof Response)) throw new Error("Expected unauthorized response");
  expect(await invalidId.json()).toEqual({
    error: { code: "UNAUTHORIZED", message: "Authentication required" },
  });
});

test("factory validates explicit configuration without exposing values and enforces production HTTPS", async () => {
  const { connection } = instance();
  const options = { database: connection.db, secret, baseURL: origin };
  expect(() => createAuth({ ...options, secret: "sensitive-invalid-secret" })).toThrow(
    /at least 32/,
  );
  let configurationError: unknown;
  try {
    createAuth({ ...options, baseURL: "http://user:password@example.com" });
  } catch (error) {
    configurationError = error;
  }
  expect(configurationError).toBeInstanceOf(Error);
  expect(String(configurationError)).not.toContain("password");
  for (const baseURL of [
    "invalid",
    "ftp://example.com",
    "https://example.com/path",
    "https://example.com/?secret=value",
  ])
    expect(() => createAuth({ ...options, baseURL })).toThrow(/origin/);
  expect(() => createAuth({ ...options, environment: "production" })).toThrow(/HTTPS/);
  expect(() => createAuth({ ...options, trustedOrigins: ["https://example.com/path"] })).toThrow(
    /trustedOrigins/,
  );
  const production = createAuth({
    ...options,
    baseURL: "https://example.com",
    environment: "production",
  });
  await production.$context;
  expect(production.options.advanced.useSecureCookies).toBe(true);
  expect(production.options.session.cookieCache.enabled).toBe(false);
  expect(production.options.rateLimit.enabled).toBe(false);
  expect(production.options.advanced.ipAddress.ipAddressHeaders).toEqual([]);
});

test("forwarded IP headers are not trusted for session tracking", async () => {
  const { connection, instance: authInstance } = instance();
  const response = await authInstance.handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "x-forwarded-for": "198.51.100.123",
        "x-real-ip": "198.51.100.124",
      },
      body: JSON.stringify({ name: "Person", email: "person@example.com", password }),
    }),
  );
  expect(response.status).toBe(200);
  expect(connection.db.select().from(sessionTable).get()?.ipAddress).not.toBe("198.51.100.123");
  expect(connection.db.select().from(sessionTable).get()?.ipAddress).not.toBe("198.51.100.124");
});

test("explicit factory secret is not replaced by the library's environment rotation config", async () => {
  vi.stubEnv("BETTER_AUTH_SECRETS", "2:test-environment-secret-with-at-least-32-characters");
  const { instance: authInstance } = instance();
  expect((await authInstance.$context).secret).toBe(secret);
});

test("explicit redirect allowlist rejects environment-added origins in HTTP body/query and direct API calls", async () => {
  const evil = "https://evil.example";
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", evil);
  const { connection, instance: authInstance } = instance();
  const fields = ["callbackURL", "errorCallbackURL", "newUserCallbackURL", "redirectTo"] as const;
  for (const field of fields) {
    const response = await post(authInstance, "sign-up/email", {
      name: "Person",
      email: "person@example.com",
      password,
      [field]: `${evil}/return?private=value`,
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(evil);
  }
  for (const field of fields) {
    const response = await post(
      authInstance,
      `sign-up/email?${field}=${encodeURIComponent(`${evil}/return`)}`,
      { name: "Person", email: "person@example.com", password },
    );
    expect(response.status).toBe(403);
  }
  const repeated = await post(
    authInstance,
    `sign-up/email?callbackURL=%2Fsafe&callbackURL=${encodeURIComponent(evil)}`,
    { name: "Person", email: "person@example.com", password },
  );
  expect(repeated.status).toBe(403);
  const malformed = await post(authInstance, "sign-up/email", {
    name: "Person",
    email: "person@example.com",
    password,
    callbackURL: 42,
  });
  expect(malformed.status).toBe(403);
  await expect(
    authInstance.api.signUpEmail({
      body: {
        name: "Person",
        email: "person@example.com",
        password,
        callbackURL: `${evil}/return`,
      },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(connection.db.select().from(user).all()).toEqual([]);
});

test("redirect validation rejects unsafe URL forms and allows site-relative and explicitly trusted origins", async () => {
  const { instance: authInstance } = instance();
  for (const callbackURL of [
    "//evil.example",
    "javascript:alert(1)",
    "ftp://localhost/return",
    "/\\evil.example",
    " https://localhost:3000/return",
    "https://user:password@localhost:3000/return",
    "https://localhost:3000/\nreturn",
  ]) {
    const response = await post(authInstance, "sign-up/email", {
      name: "Person",
      email: "person@example.com",
      password,
      callbackURL,
    });
    expect(response.status).toBe(403);
  }
  const relative = await post(authInstance, "sign-up/email", {
    name: "Relative",
    email: "relative@example.com",
    password,
    callbackURL: "/dashboard?tab=profile",
  });
  expect(relative.status).toBe(200);
  const absolute = await post(authInstance, "sign-up/email", {
    name: "Absolute",
    email: "absolute@example.com",
    password,
    callbackURL: `${origin}/dashboard`,
  });
  expect(absolute.status).toBe(200);
  const direct = await authInstance.api.signUpEmail({
    body: { name: "Direct", email: "direct@example.com", password, callbackURL: "/dashboard" },
  });
  expect(direct.user.email).toBe("direct@example.com");
  const { connection } = instance();
  const additional = createAuth({
    database: connection.db,
    secret,
    baseURL: origin,
    environment: "test",
    trustedOrigins: ["https://trusted.example"],
  });
  const trusted = await post(additional, "sign-up/email", {
    name: "Trusted",
    email: "trusted@example.com",
    password,
    callbackURL: "https://trusted.example/dashboard",
  });
  expect(trusted.status).toBe(200);
});
