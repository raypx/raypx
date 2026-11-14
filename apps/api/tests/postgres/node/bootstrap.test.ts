import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  accountBootstrap,
  adminAudit,
  mailConfiguration,
  rateLimit,
  systemConfiguration,
  user,
  verification,
} from "@raypx/database/schema";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { createApiClient } from "@raypx/client/api";
import { configurationDefaults } from "@raypx/contracts/api";
import { createMailer, type MailMessage } from "@raypx/email/server";
import { eq, inArray, like } from "drizzle-orm";
import { createApiApp } from "../../helpers/app.js";
import { createRegistration } from "../../../src/admin/registration.js";
import { createAuditedAuthAdapter } from "../../../src/admin/auth-adapter.js";
import { createPasswordResetLinks } from "../../../src/admin/password-reset.js";
import { AuditService } from "../../../src/admin/audit.js";
import { createAdministrationRepository } from "../../../src/admin/repository.js";
import { createConfigRepository } from "../../../src/config/repository.js";
import { createConfigService } from "../../../src/config/service.js";
import { createResendSettings, databaseMailer } from "../../../src/config/resend.js";
import { createConfigReads } from "../../../src/config/reads.js";
import { createAccessPolicy } from "../../../src/access.js";
import { createSpaceAccess, createSpaceManagement } from "@raypx/spaces/server/postgres";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) ||
  !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname)
)
  throw new Error("Bootstrap acceptance requires the explicitly owned loopback database");
const connection = connectDatabase(url);
const db = connection.db;
const administration = createAdministrationRepository(db);
const audit = new AuditService(administration);
const reads = createConfigReads();
const key = "bootstrap-fixture-encryption-key-32-characters";
const messages: MailMessage[] = [];
const mailer = databaseMailer(db, key, reads, (options) =>
  createMailer({
    ...options,
    transport: {
      async send(message) {
        messages.push(message);
      },
    },
  }),
);
const config = createConfigService({
  repository: createConfigRepository(db, audit),
  access: createAccessPolicy(),
  audit,
  reads,
});
const setupToken = "bootstrap-fixture-setup-token-32-characters";
const registration = createRegistration(db, {
  setupToken,
  mailAvailable: mailer.available,
  clientIpHeader: "x-fixture-ip",
});
const auth = createAuth({
  registrationManaged: true,
  database: createAuditedAuthAdapter(db, audit, registration),
  mailer,
  config: {
    baseURL: "http://localhost:3002",
    secret: "bootstrap-fixture-auth-secret-32-characters",
    trustedOrigins: ["http://localhost:3000"],
    production: false,
  },
});
const readSession = (headers: Headers) => readAuthSession(auth, headers, mailer.available);
const spaceAccess = createSpaceAccess(db);
const spaceManagement = createSpaceManagement(db, { async beforeMemberRemoved() {} });
const app = createApiApp({
  authHandler: (incoming) => registration.handle(incoming, () => auth.handler(incoming)),
  readSession,
  allowedOrigins: ["http://localhost:3000"],
  config,
  audit,
  administration,
  registration,
  mailAvailable: mailer.available,
  testMail: mailer.sendTest,
  passwordResetLinks: createPasswordResetLinks(db, audit, mailer.available),
  resendSettings: createResendSettings(db, key, audit, reads),
  spaces: spaceAccess,
  spaceManagement,
});
const emails: string[] = [];
const cookies: string[] = [];
const password = "bootstrap-fixture-password-123";
function cookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
function request(path: string, body: object, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(`http://localhost:3002/api/auth/${path}`, {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}
function client(value: string) {
  return createApiClient({
    baseUrl: "http://localhost:3002",
    headers: { cookie: value, origin: "http://localhost:3000" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
}
async function signup(index: string, headers: Record<string, string> = {}) {
  const email = `bootstrap-${index}-${crypto.randomUUID()}@example.test`;
  emails.push(email);
  return request(
    "sign-up/email",
    { email, name: "Bootstrap Fixture", password },
    { "x-fixture-ip": index, ...headers },
  );
}

beforeAll(async () => {
  await migrateDatabase(url);
  if (
    (await db.select().from(user).limit(1)).length ||
    (await db.select().from(accountBootstrap)).length ||
    (await db.select().from(systemConfiguration)).length ||
    (await db.select().from(mailConfiguration)).length
  )
    throw new Error("Bootstrap test requires empty owned fixture tables");
});
afterAll(async () => {
  await db.delete(systemConfiguration);
  await db.delete(mailConfiguration);
  await db.delete(adminAudit);
  await db.delete(user).where(inArray(user.email, emails));
  await db.delete(accountBootstrap);
  await db.delete(rateLimit).where(like(rateLimit.key, "account-setup:%"));
  reads.close();
  await connection.close();
});

it("requires the setup token, rejects wrong tokens, rate limits attempts, and commits no claim", async () => {
  expect((await signup("bad")).status).toBe(400);
  for (let index = 0; index < 4; index++)
    expect((await signup("bad", { "x-raypx-setup-token": "wrong" })).status).toBe(400);
  expect((await signup("bad", { "x-raypx-setup-token": setupToken })).status).toBe(429);
  expect(
    (
      await request(
        "sign-up/email/",
        { email: "bootstrap-trailing@example.test", name: "Trailing", password },
        { "x-fixture-ip": "bad", "x-raypx-setup-token": setupToken },
      )
    ).status,
  ).toBe(429);
  expect(await registration.status()).toEqual({ bootstrap: true, setupTokenRequired: true });
  expect(await db.select().from(user)).toHaveLength(0);
});
it("serializes eight first sign-ups into exactly one administrator, with immediately usable unverified accounts", async () => {
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      signup(`race-${index}`, { "x-raypx-setup-token": setupToken }),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual(Array(8).fill(200));
  for (const response of responses) cookies.push(cookie(response));
  const accounts = await db.select().from(user);
  expect(accounts.filter((account) => account.role === "admin")).toHaveLength(1);
  expect(
    accounts.every((account) => !account.emailVerified && account.emailVerificationSkipped),
  ).toBe(true);
  expect(messages).toHaveLength(0);
  expect(await registration.status()).toEqual({ bootstrap: false, setupTokenRequired: false });
  for (const value of cookies)
    expect((await client(value).account.access({})).role).not.toBe("guest");
  const later = await signup("later");
  expect(later.status).toBe(200);
  expect(((await later.json()) as { user: { role: string } }).user.role).toBe("member");
});
it("enforces invitation-only with bearer links and does not grant Space access to administrators", async () => {
  const adminCookie =
    cookies[
      (
        await Promise.all(
          cookies.map(
            async (value) => (await readSession(new Headers({ cookie: value })))!.user.role,
          ),
        )
      ).indexOf("admin")
    ]!;
  const admin = (await readSession(new Headers({ cookie: adminCookie })))!;
  const owner = (await readSession(
    new Headers({ cookie: cookies.find((value) => value !== adminCookie)! }),
  ))!;
  const owned = (await spaceAccess.list(owner.user.id))[0]!.space;
  const scope = await spaceAccess.resolve(owner.user.id, owned.id);
  const invitation = await spaceManagement.createInvitation(scope);
  const snapshot = await config.read();
  await client(adminCookie).configuration.update({
    values: { ...configurationDefaults, registrationEnabled: false },
    revision: snapshot.revision,
  });
  expect((await signup("closed")).status).toBe(400);
  const joined = await signup("invited", { "x-raypx-invitation": invitation.token });
  expect(joined.status).toBe(200);
  const value = cookie(joined);
  cookies.push(value);
  const account = (await readSession(new Headers({ cookie: value })))!;
  expect(account.user.emailVerified).toBe(false);
  expect((await spaceManagement.acceptInvitation(account.user.id, invitation.token)).joined).toBe(
    true,
  );
  expect((await signup("reused", { "x-raypx-invitation": invitation.token })).status).toBe(400);
  await expect(spaceAccess.resolve(admin.user.id, owned.id)).rejects.toThrow(
    "Space record not found",
  );
});
it("issues an audited expiring reset link once and the real auth reset consumes it only once", async () => {
  const adminCookie = (
    await Promise.all(
      cookies.map(async (value) => ({
        value,
        role: (await readSession(new Headers({ cookie: value })))?.user.role,
      })),
    )
  ).find((item) => item.role === "admin")!.value;
  const target = (await readSession(
    new Headers({ cookie: cookies.find((value) => value !== adminCookie)! }),
  ))!;
  const issued = await client(adminCookie).admin.issuePasswordReset({ userId: target.user.id });
  expect(Date.parse(issued.expiresAt) - Date.now()).toBeLessThanOrEqual(900_000);
  const journal = await administration.list({ limit: 100 });
  expect(
    journal.entries.some(
      (entry) =>
        entry.action === "user.password.reset-link" &&
        entry.outcome === "success" &&
        entry.targetId === target.user.id,
    ),
  ).toBe(true);
  expect(JSON.stringify(journal)).not.toContain(issued.token);
  expect(
    (
      await request("reset-password", {
        token: issued.token,
        newPassword: "replacement-fixture-password",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request("reset-password", {
        token: issued.token,
        newPassword: "second-fixture-password",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request("sign-in/email", {
        email: target.user.email,
        password: "replacement-fixture-password",
      })
    ).status,
  ).toBe(200);
  const expired = await client(adminCookie).admin.issuePasswordReset({ userId: target.user.id });
  await db
    .update(verification)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(eq(verification.identifier, `reset-password:${expired.token}`));
  expect(
    (
      await request("reset-password", {
        token: expired.token,
        newPassword: "expired-fixture-password",
      })
    ).status,
  ).toBe(400);
  const superseded = await client(adminCookie).admin.issuePasswordReset({ userId: target.user.id });
  const current = await client(adminCookie).admin.issuePasswordReset({ userId: target.user.id });
  expect(
    (
      await request("reset-password", {
        token: superseded.token,
        newPassword: "superseded-fixture-password",
      })
    ).status,
  ).toBe(400);
  const racing = await Promise.all(
    Array.from({ length: 2 }, async () =>
      request("reset-password", {
        token: current.token,
        newPassword: "concurrent-fixture-password",
      }),
    ),
  );
  expect(racing.map((response) => response.status).sort((left, right) => left - right)).toEqual([
    200, 400,
  ]);
});
it("reads mail configuration freshly, sends a test through fake transport, verifies new accounts, and retains earlier access", async () => {
  const adminCookie = (
    await Promise.all(
      cookies.map(async (value) => ({
        value,
        role: (await readSession(new Headers({ cookie: value })))?.user.role,
      })),
    )
  ).find((item) => item.role === "admin")!.value;
  const api = client(adminCookie);
  const current = await config.read();
  await api.configuration.update({ values: configurationDefaults, revision: current.revision });
  await api.configuration.updateResend({
    values: { from: "Raypx <mail@example.test>", defaultLocale: "en", enabled: true },
    apiKey: "fixture-only-mail-key",
    revision: 0,
  });
  expect((await api.configuration.public({})).mailConfigured).toBe(true);
  expect(await api.configuration.testMail({ locale: "zh" })).toEqual({ sent: true });
  expect(messages.at(-1)!.subject).toContain("测试");
  const response = await signup("mail");
  expect(response.status).toBe(200);
  expect(cookie(response)).not.toContain("session_token");
  const created = (
    (await response.json()) as { user: { email: string; emailVerificationSkipped: boolean } }
  ).user;
  expect(created.emailVerificationSkipped).toBe(false);
  expect((await request("sign-in/email", { email: created.email, password })).status).toBe(403);
  const verificationURL = messages.at(-1)!.text.match(/http[^\s]+\/verify-email[^\s]+/)?.[0];
  expect(verificationURL).toBeTruthy();
  expect([200, 302]).toContain((await app.fetch(new Request(verificationURL!))).status);
  expect((await request("sign-in/email", { email: created.email, password })).status).toBe(200);
  expect((await api.account.access({})).role).toBe("admin");
});
it("never reopens bootstrap after all accounts are deleted", async () => {
  await db.delete(user).where(inArray(user.email, emails));
  expect(await registration.status()).toEqual({ bootstrap: false, setupTokenRequired: false });
  const response = await signup("after-delete");
  expect(response.status).toBe(200);
  expect(((await response.json()) as { user: { role: string } }).user.role).toBe("member");
});
