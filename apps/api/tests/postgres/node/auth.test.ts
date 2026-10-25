import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { schema, user, session } from "@raypx/database/schema";
import { eq } from "drizzle-orm";
import { createApiClient } from "@raypx/client";
import { createApiApp } from "../../../server/api.js";
import type { AuthMailInput } from "@raypx/auth/server";
import { ControlService } from "../../../server/control/service.js";
import { createControlRepository } from "../../../server/control/repository.js";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must name an isolated *_test database");
const connection = connectDatabase(databaseURL);
const emails: AuthMailInput[] = [];
const email = `foundation-${crypto.randomUUID()}@example.com`;
const control = new ControlService(createControlRepository(connection.db));
const auth = createAuth({
  revokeHostAuthorizations: (userId, sessionId) =>
    control.revokeHostAuthorizations(userId, sessionId),
  database: drizzleAdapter(connection.db, { provider: "pg", schema }),
  config: {
    baseURL: "http://localhost:3002",
    secret: "foundation-integration-secret-32-characters",
    trustedOrigins: ["http://localhost:3000"],
    production: false,
  },
  mailer: {
    async sendVerification(input) {
      emails.push(input);
    },
    async sendPasswordReset(input) {
      emails.push(input);
    },
  },
});
const app = createApiApp({
  control,
  authHandler: (request) => auth.handler(request),
  readSession: (headers) => readAuthSession(auth, headers),
  allowedOrigins: ["http://localhost:3000"],
});
const request = (path: string, data: object, cookie?: string) =>
  app.fetch(
    new Request(`http://localhost:3002/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "accept-language": "zh",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(data),
    }),
  );
beforeAll(async () => {
  await migrateDatabase(databaseURL);
});
afterAll(async () => {
  await connection.db.delete(user).where(eq(user.email, email));
  await connection.close();
});

it("registers, verifies, signs in, resets password and revokes the session", async () => {
  expect(
    (
      await request("sign-up/email", {
        email,
        name: "Foundation User",
        password: "original-password-123",
        callbackURL: "http://localhost:3000/verify-email",
      })
    ).status,
  ).toBe(200);
  expect(emails).toHaveLength(1);
  expect(emails[0]?.locale).toBe("zh");
  expect(
    (await request("sign-in/email", { email, password: "original-password-123" })).status,
  ).toBe(403);
  const verification = await app.fetch(new Request(emails[0]!.url));
  expect([200, 302]).toContain(verification.status);
  const signedIn = await request("sign-in/email", { email, password: "original-password-123" });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token");
  const headers = new Headers({ cookie });
  expect((await readAuthSession(auth, headers))?.user.name).toBe("Foundation User");
  const client = createApiClient({
    baseUrl: "http://localhost:3002",
    headers: { cookie },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  expect(await client.account.get({})).toMatchObject({ email, name: "Foundation User" });
  expect(
    (
      await request("request-password-reset", {
        email,
        redirectTo: "http://localhost:3000/reset-password",
      })
    ).status,
  ).toBe(200);
  const resetURL = new URL(emails.at(-1)!.url);
  const token = resetURL.pathname.split("/").at(-1)!;
  expect(
    (await request("reset-password", { token, newPassword: "replacement-password-456" })).status,
  ).toBe(200);
  expect(
    (await request("sign-in/email", { email, password: "original-password-123" })).status,
  ).toBe(401);
  expect(await readAuthSession(auth, headers)).toBeNull();
  const replacement = await request("sign-in/email", {
    email,
    password: "replacement-password-456",
  });
  expect(replacement.status).toBe(200);
  const replacementCookie = replacement.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const signOut = await app.fetch(
    new Request("http://localhost:3002/api/auth/sign-out", {
      method: "POST",
      headers: {
        cookie: replacementCookie,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(signOut.status).toBe(200);
  expect(await readAuthSession(auth, new Headers({ cookie: replacementCookie }))).toBeNull();
}, 30000);

it("reauthenticates stale host bootstrap in place and scopes successful session revocations", async () => {
  const address = `host-${crypto.randomUUID()}@example.test`,
    password = "host-password-123456";
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const client = (cookie: string) =>
    createApiClient({
      baseUrl: "http://localhost:3002",
      headers: { cookie, origin: "http://localhost:3000" },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    });
  try {
    expect(
      (await request("sign-up/email", { email: address, name: "Host User", password })).status,
    ).toBe(200);
    await connection.db.update(user).set({ emailVerified: true }).where(eq(user.email, address));
    const stale = await request("sign-in/email", { email: address, password });
    const staleCookie = cookieOf(stale);
    const staleSession = (await readAuthSession(auth, new Headers({ cookie: staleCookie })))!;
    await connection.db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 3600_000) })
      .where(eq(session.id, staleSession.session.id));
    const first = await client(staleCookie).devices.register({
      installationId: crypto.randomUUID(),
      name: "First Mac",
      platform: "darwin",
      appVersion: "0.1.0",
      reconnect: false,
    });
    await expect(client(staleCookie).hosts.authorize(first)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    // The same logged-in account signs in again without logout or device detachment.
    const fresh = await request("sign-in/email", { email: address, password }, staleCookie);
    expect(fresh.status).toBe(200);
    const firstCookie = cookieOf(fresh);
    const freshSession = (await readAuthSession(auth, new Headers({ cookie: firstCookie })))!;
    expect(freshSession.session.id).not.toBe(staleSession.session.id);
    const firstKey = await client(firstCookie).hosts.authorize(first);
    const secondSignIn = await request("sign-in/email", { email: address, password });
    const secondCookie = cookieOf(secondSignIn);
    const secondClient = client(secondCookie);
    const second = await secondClient.devices.register({
      installationId: crypto.randomUUID(),
      name: "Second Mac",
      platform: "darwin",
      appVersion: "0.1.0",
      reconnect: false,
    });
    const secondKey = await secondClient.hosts.authorize(second);
    const [target] = await connection.db
      .select()
      .from(session)
      .where(eq(session.id, freshSession.session.id));
    expect((await request("revoke-session", { token: target!.token }, secondCookie)).status).toBe(
      200,
    );
    await expect(
      secondClient.hosts.grant({ credential: firstKey.credential }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      secondClient.hosts.grant({ credential: secondKey.credential }),
    ).resolves.toHaveProperty("accountId", secondKey.accountId);
    expect((await request("revoke-other-sessions", {}, secondCookie)).status).toBe(200);
    await expect(
      secondClient.hosts.grant({ credential: secondKey.credential }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(secondClient.hosts.authorize(second)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const restored = cookieOf(
      await request("sign-in/email", { email: address, password }, secondCookie),
    );
    await expect(client(restored).hosts.authorize(second)).resolves.toHaveProperty(
      "accountId",
      secondKey.accountId,
    );
  } finally {
    await connection.db.delete(user).where(eq(user.email, address));
  }
}, 30000);
