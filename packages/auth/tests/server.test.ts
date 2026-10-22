import { expect, it, vi } from "vite-plus/test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, projectAuthUser, recipientLocale } from "../src/server.js";

it("projects a fresh account without roles and strips credentials", () => {
  expect(
    projectAuthUser({
      id: "u",
      email: "u@example.com",
      name: "User",
      emailVerified: true,
      password: "secret",
      role: "owner",
    }),
  ).toEqual({ id: "u", email: "u@example.com", name: "User", emailVerified: true });
});

it("derives mail locale from the current request", () => {
  expect(
    recipientLocale(
      new Request("https://example.com", {
        headers: { "accept-language": "fr,zh-CN;q=0.9,en;q=0.8" },
      }),
    ),
  ).toEqual({ locale: "zh" });
  expect(recipientLocale()).toEqual({});
  expect(
    recipientLocale(
      new Request("https://example.com", {
        headers: { "accept-language": "en;q=0,fr;q=1,zh-Hant-TW;q=0.8" },
      }),
    ),
  ).toEqual({ locale: "zh" });
  expect(
    recipientLocale(new Request("https://example.com", { headers: { "accept-language": "fr" } })),
  ).toEqual({});
});

it("injects persistence and mail callbacks without domain package imports", async () => {
  const mailer = {
    sendVerification: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
  };
  const database = memoryAdapter({});
  const auth = createAuth({
    database,
    mailer,
    config: {
      baseURL: "http://localhost:3002",
      secret: "test-foundation-secret-at-least-32-characters",
      trustedOrigins: [],
      production: false,
    },
  });
  await auth.options.emailVerification?.sendVerificationEmail?.(
    {
      user: {
        id: "u",
        email: "u@example.com",
        name: "User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      url: "https://example.com/verify",
      token: "secret",
    },
    new Request("https://example.com", { headers: { "accept-language": "zh" } }),
  );
  expect(mailer.sendVerification).toHaveBeenCalledWith({
    email: "u@example.com",
    name: "User",
    url: "https://example.com/verify",
    locale: "zh",
  });
});

it("shares session cookies with the Web host only when a parent domain is configured", () => {
  const options = (cookieDomain?: string) =>
    createAuth({
      database: memoryAdapter({}),
      mailer: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
      config: {
        baseURL: "https://api.example.com",
        secret: "test-foundation-secret-at-least-32-characters",
        trustedOrigins: [],
        production: true,
        ...(cookieDomain ? { cookieDomain } : {}),
      },
    }).options.advanced;
  expect(options("example.com")?.crossSubDomainCookies).toEqual({
    enabled: true,
    domain: "example.com",
  });
  expect(options()?.crossSubDomainCookies).toBeUndefined();
});

it("rejects user creation while registration is closed and names the site in mail", async () => {
  let open = false;
  const sent: unknown[] = [];
  const auth = createAuth({
    database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
    mailer: {
      sendVerification: async (input) => {
        sent.push(input);
      },
      sendPasswordReset: async () => {},
    },
    registrationAllowed: async () => open,
    siteName: async () => "Team",
    config: {
      baseURL: "http://localhost:3002",
      secret: "test-foundation-secret-at-least-32-characters",
      trustedOrigins: [],
      production: false,
    },
  });
  const signUp = () =>
    auth.handler(
      new Request("http://localhost:3002/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "password-123456",
          name: "New",
        }),
      }),
    );
  const closed = await signUp();
  expect(closed.status).toBe(400);
  expect(await closed.json()).toMatchObject({ code: "REGISTRATION_DISABLED" });
  expect(sent).toHaveLength(0);
  open = true;
  expect((await signUp()).status).toBe(200);
  expect(sent).toMatchObject([{ email: "new@example.com", siteName: "Team" }]);
});
