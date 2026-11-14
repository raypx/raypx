import { createApiClient } from "@raypx/client/api";
import { afterAll, beforeAll, expect, it } from "vitest";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { schema, user } from "@raypx/database/schema";
import { eq } from "drizzle-orm";
import { createApiApp } from "../../helpers/app.js";
import type { AuthMailInput } from "@raypx/auth/server";
import { createAccessPolicy } from "../../../src/access.js";
import { createConfigRepository } from "../../../src/config/repository.js";
import { createConfigService } from "../../../src/config/service.js";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !/_test(?:_[a-z0-9]+)?$/.test(new URL(databaseURL).pathname))
  throw new Error("TEST_DATABASE_URL must name an isolated *_test or *_test_<lane> database");
const connection = connectDatabase(databaseURL);
const emails: AuthMailInput[] = [];
const codes: { email: string; code: string; locale?: string }[] = [];
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
    async sendSignInCode(input) {
      codes.push(input);
    },
  },
});
const app = createApiApp({
  config: createConfigService({
    repository: createConfigRepository(connection.db),
    access: createAccessPolicy(),
  }),
  authHandler: (request) => auth.handler(request),
  readSession: (headers) => readAuthSession(auth, headers),
  allowedOrigins: ["http://localhost:3000"],
});
const request = (path: string, data: object, cookie?: string, origin = "http://localhost:3000") =>
  app.fetch(
    new Request(`http://localhost:3002/api/auth/${path.replace(/^\//, "")}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
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
  const readOpenApiAccount = () => app.request("/api/v1/account", { headers });
  const account = await readOpenApiAccount();
  expect(account.status).toBe(200);
  expect(await account.json()).toMatchObject({ email, name: "Foundation User" });
  const currentUser = (await readAuthSession(auth, headers))!.user;
  expect(await client.account.access({})).toMatchObject({ role: "member" });
  expect(
    (await request("admin/set-role", { userId: currentUser.id, role: "admin" }, cookie)).status,
  ).toBe(403);
  await connection.db.update(user).set({ role: "admin" }).where(eq(user.id, currentUser.id));
  expect(await client.account.access({})).toMatchObject({
    role: "admin",
    permissions: expect.arrayContaining(["configuration.update"]),
  });
  expect(
    (await request("admin/set-role", { userId: currentUser.id, role: "member" }, cookie)).status,
  ).toBe(403);
  await (await auth.$context).internalAdapter.updateUser(currentUser.id, { role: "member" });
  expect(await client.account.access({})).toMatchObject({ role: "member" });
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
  expect((await readOpenApiAccount()).status).toBe(401);
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

it("signs in existing accounts with a single-use email code and enforces TOTP on password login", async () => {
  const address = `factors-${crypto.randomUUID()}@example.com`;
  const password = "factors-fixture-password";
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  try {
    expect(
      (
        await request("sign-up/email", {
          email: address,
          name: "Factor Test",
          password,
          callbackURL: "http://localhost:3000/verify-email",
        })
      ).status,
    ).toBe(200);
    await app.fetch(new Request(emails.find((mail) => mail.email === address)!.url));

    const send = (recipient: string) =>
      request("email-otp/send-verification-otp", { email: recipient, type: "sign-in" });
    expect((await send("missing-account@example.com")).status).toBe(200);
    expect(codes.some((mail) => mail.email === "missing-account@example.com")).toBe(false);
    expect((await send(address)).status).toBe(200);
    const mailed = codes.find((mail) => mail.email === address)!;
    expect(mailed).toMatchObject({ locale: "zh", code: expect.stringMatching(/^\d{6}$/) });
    const codeRequest = () => request("sign-in/email-otp", { email: address, otp: mailed.code });
    const fromEmail = await codeRequest();
    expect(fromEmail.status).toBe(200);
    expect(
      (await readAuthSession(auth, new Headers({ cookie: cookieOf(fromEmail) })))?.user.email,
    ).toBe(address);
    expect((await codeRequest()).status).toBe(400);

    const verifiedCookie = cookieOf(fromEmail);
    const setup = await request("two-factor/enable", { method: "totp", password }, verifiedCookie);
    expect(setup.status).toBe(200);
    const { totpURI, backupCodes } = (await setup.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    const encodedSecret = new URL(totpURI).searchParams.get("secret")!;
    const bits = encodedSecret
      .split("")
      .map((letter) =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(letter).toString(2).padStart(5, "0"),
      )
      .join("");
    const secret = (bits.match(/.{8}/g) ?? [])
      .map((byte) => String.fromCharCode(Number.parseInt(byte, 2)))
      .join("");
    const context = await auth.$context;
    const row = await context.internalAdapter.findUserByEmail(address);
    const stored = await context.adapter.findOne<{ secret: string; backupCodes: string }>({
      model: "twoFactor",
      where: [{ field: "userId", value: row!.user.id }],
    });
    expect(stored?.secret).not.toBe(secret);
    expect(stored?.backupCodes).not.toContain(backupCodes[0]);
    const { code } = await auth.api.generateTOTP({ body: { secret } });
    const verified = await request("two-factor/verify-totp", { code }, verifiedCookie);
    expect(verified.status).toBe(200);
    const codeCount = codes.length;
    expect((await send(address)).status).toBe(200);
    expect(codes).toHaveLength(codeCount);
    expect((await codeRequest()).status).toBe(400);

    const signIn = () => request("sign-in/email", { email: address, password });
    const challenged = await signIn();
    expect(await challenged.json()).toMatchObject({ twoFactorRedirect: true });
    const pending = cookieOf(challenged);
    expect(await readAuthSession(auth, new Headers({ cookie: pending }))).toBeNull();
    const backup = { code: backupCodes[0] };
    const completed = await request("two-factor/verify-backup-code", backup, pending);
    expect(completed.status).toBe(200);
    expect(
      (await readAuthSession(auth, new Headers({ cookie: cookieOf(completed) })))?.user.email,
    ).toBe(address);
    const secondChallenge = cookieOf(await signIn());
    expect((await request("two-factor/verify-backup-code", backup, secondChallenge)).ok).toBe(
      false,
    );
    const totp = await auth.api.generateTOTP({ body: { secret } });
    const signedInWithTotp = await request("two-factor/verify-totp", totp, secondChallenge);
    expect(signedInWithTotp.status).toBe(200);
  } finally {
    await connection.db.delete(user).where(eq(user.email, address));
  }
});
