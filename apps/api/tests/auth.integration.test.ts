import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth } from "@raypx/auth/server";
import { connectDatabase, migrateDatabase } from "@raypx/db";
import { schema, user } from "@raypx/db/schema";
import { eq } from "drizzle-orm";
import { createApiClient } from "@raypx/client";
import { createApiApp } from "../server/api.js";
import { readAuthSession } from "@raypx/auth/server";
import type { AuthMailInput } from "@raypx/auth/server";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must name an isolated *_test database");
const connection = connectDatabase(databaseURL);
const emails: AuthMailInput[] = [];
const email = `foundation-${crypto.randomUUID()}@example.com`;
const auth = createAuth({
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
  authHandler: (request) => auth.handler(request),
  readSession: (headers) => readAuthSession(auth, headers),
  allowedOrigins: ["http://localhost:3000"],
});
const request = (path: string, data: object) =>
  app.fetch(
    new Request(`http://localhost:3002/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "accept-language": "zh",
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
