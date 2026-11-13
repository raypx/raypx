import { afterAll, beforeAll, expect, it } from "vitest";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { schema, user, session } from "@raypx/database/schema";
import { eq } from "drizzle-orm";
import {
  desktopLoginPaths,
  desktopLoginAuthorizationSchema,
  desktopOAuthClientId,
  desktopOAuthTokensSchema,
  oauthTokenPath,
  desktopLoginRedirectSchema,
} from "@raypx/contracts/api";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";
import type { AuthMailInput } from "@raypx/auth/server";
import { ControlService } from "@raypx/control";
import { createControlRepository } from "@raypx/control/postgres";
import { createAccessPolicy } from "../../../src/access.js";
import { createConfigRepository } from "../../../src/config/repository.js";
import { createConfigService } from "../../../src/config/service.js";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must name an isolated *_test database");
const connection = connectDatabase(databaseURL);
const emails: AuthMailInput[] = [];
const codes: { email: string; code: string; locale?: string }[] = [];
const email = `foundation-${crypto.randomUUID()}@example.com`;
const control = new ControlService(createControlRepository(connection.db));
const auth = createAuth({
  revokeHostAuthorizations: (userId, sessionId) =>
    control.credentials.revokeHostAuthorizations(userId, sessionId),
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
  control,
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
    const redirectUri = "http://127.0.0.1:41337/desktop-login/callback";
    const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const challenge = new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const start = await request(
      desktopLoginPaths.start,
      {
        redirectUri,
        challenge,
        nonce,
        webOrigin: "http://localhost:3000",
        state: "s".repeat(43),
        device: "First Mac",
        accountId: staleSession.user.id,
      },
      undefined,
      "",
    );
    expect(start.status).toBe(200);
    const { authorizationUrl } = desktopLoginAuthorizationSchema.parse(await start.json());
    const authorized = await app.fetch(
      new Request(authorizationUrl, { headers: { cookie: staleCookie } }),
    );
    expect(authorized.status).toBe(302);
    const handoff = await app.fetch(new Request(authorized.headers.get("location")!));
    expect(handoff.status).toBe(302);
    const oauthQuery = new URL(handoff.headers.get("location")!).searchParams.get("oauth");
    const approved = await request(
      desktopLoginPaths.decide,
      {
        oauthQuery,
        accountId: staleSession.user.id,
        approve: true,
      },
      staleCookie,
    );
    expect(approved.status).toBe(200);
    const callback = new URL(desktopLoginRedirectSchema.parse(await approved.json()).redirectUri);
    const tokenRequest = () =>
      app.fetch(
        new Request(new URL(oauthTokenPath, "http://localhost:3002").href, {
          method: "POST",
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: desktopOAuthClientId,
            code: callback.searchParams.get("code")!,
            redirect_uri: redirectUri,
            code_verifier: verifier,
          }),
        }),
      );
    const token = await tokenRequest();
    expect(token.status).toBe(200);
    const { access_token: accessToken, id_token: idToken } = desktopOAuthTokensSchema.parse(
      await token.json(),
    );
    const exchange = () =>
      request(desktopLoginPaths.exchange, { accessToken, idToken, nonce }, undefined, "");
    const responses = await Promise.all([exchange(), exchange()]);
    expect(responses.map(({ status }) => status).sort((a, b) => a - b)).toEqual([200, 400]);
    expect((await tokenRequest()).status).toBe(400);
    const metadata = await app.fetch(
      new Request("http://localhost:3002/.well-known/openid-configuration"),
    );
    expect(metadata.status).toBe(200);
    const desktopCookie = cookieOf(responses.find((response) => response.ok)!);
    const desktopSession = await readAuthSession(auth, new Headers({ cookie: desktopCookie }));
    expect(desktopSession?.user.id).toBe(staleSession.user.id);
    expect(desktopSession?.session.id).not.toBe(staleSession.session.id);
    await expect(client(desktopCookie).hosts.authorize(first)).rejects.toMatchObject({
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
