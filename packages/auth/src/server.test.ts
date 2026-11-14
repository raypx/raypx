import { expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, projectAuthUser, recipientLocale } from "./server.js";

it("projects Better Auth role fields and strips credentials", () => {
  expect(
    projectAuthUser({
      id: "u",
      email: "u@example.com",
      name: "User",
      emailVerified: true,
      password: "secret",
      role: "member",
      banned: false,
    }),
  ).toEqual({
    id: "u",
    email: "u@example.com",
    name: "User",
    emailVerified: true,
    role: "member",
    banned: false,
  });
  expect(
    projectAuthUser({ id: "u", email: "u@example.com", name: "User", emailVerified: true }),
  ).toBeNull();
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

it("requires a valid Turnstile result for email-code requests when configured", async () => {
  const origin = "http://localhost:3000";
  const sendSignInCode = vi.fn(async () => {});
  const auth = createAuth({
    database: memoryAdapter({ user: [], verification: [] }),
    mailer: {
      sendVerification: async () => {},
      sendPasswordReset: async () => {},
      sendSignInCode,
    },
    config: {
      baseURL: origin,
      secret: "turnstile-test-secret-at-least-32-characters",
      trustedOrigins: [],
      production: false,
      turnstile: { siteKey: "public-fixture-key", secretKey: "server-fixture-key" },
    },
  });
  const { internalAdapter } = await auth.$context;
  await internalAdapter.createUser(
    {
      name: "Turnstile Test",
      email: "otp@example.test",
      emailVerified: true,
    },
    { method: "email-password" },
  );
  const capabilities = await auth.handler(new Request(`${origin}/api/auth/social-providers`));
  expect(await capabilities.json()).toEqual({
    providers: [],
    turnstileSiteKey: "public-fixture-key",
  });
  const send = (token?: string) =>
    auth.handler(
      new Request(`${origin}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          ...(token ? { "x-captcha-response": token } : {}),
        },
        body: JSON.stringify({ email: "otp@example.test", type: "sign-in" }),
      }),
    );
  expect((await send()).status).toBe(400);
  const siteverify = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ success: true, hostname: "localhost", action: "other" }))
    .mockResolvedValueOnce(
      Response.json({ success: true, hostname: "localhost", action: "email-code" }),
    );
  try {
    expect((await send("wrong-action")).status).toBe(403);
    expect(sendSignInCode).not.toHaveBeenCalled();
    expect((await send("correct-action")).status).toBe(200);
    expect(siteverify).toHaveBeenCalledTimes(2);
    expect(sendSignInCode).toHaveBeenCalledOnce();
  } finally {
    siteverify.mockRestore();
  }
});

it("checks password hash prefixes only when setting a password and rejects known matches", async () => {
  const origin = "http://localhost:3000";
  const auth = createAuth({
    database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
    mailer: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
    config: {
      baseURL: origin,
      secret: "password-check-test-secret-at-least-32-characters",
      trustedOrigins: [],
      production: false,
      checkCompromisedPasswords: true,
    },
  });
  const password = "compromised-fixture";
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)),
  );
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const rangeLookup = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(`${hash.slice(5)}:10\r\n`));
  try {
    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ name: "Test", email: "check@example.test", password }),
      }),
    );
    expect(signUp.status).toBe(400);
    expect(await signUp.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    expect(rangeLookup).toHaveBeenCalledOnce();
    const lookup = new Request(rangeLookup.mock.calls[0]![0], rangeLookup.mock.calls[0]![1]);
    expect(lookup.url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(lookup.body).toBeNull();
    expect(lookup.headers.get("add-padding")).toBe("true");
  } finally {
    rangeLookup.mockRestore();
  }
});

it("admits no-mail accounts immediately without claiming email ownership, then verifies only later signups", async () => {
  let configured = false;
  const sent: string[] = [];
  const auth = createAuth({
    database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
    config: {
      baseURL: "http://localhost:3002",
      secret: "no-mail-test-secret-at-least-32-characters",
      trustedOrigins: [],
      production: false,
    },
    mailer: {
      available: async () => configured,
      sendVerification: async (input) => {
        sent.push(input.url);
      },
      sendPasswordReset: async () => {},
    },
  });
  const post = (path: string, body: object) =>
    auth.handler(
      new Request(`http://localhost:3002/api/auth/${path}`, {
        method: "POST",
        headers: { origin: "http://localhost:3002", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const signup = (email: string) =>
    post("sign-up/email", {
      email,
      name: "No Mail",
      password: "no-mail-password-123",
    });
  const initial = await signup("initial@example.test");
  expect(initial.status).toBe(200);
  expect(initial.headers.getSetCookie().join(";")).toContain("session_token");
  expect(await initial.json()).toMatchObject({
    user: { emailVerified: false, emailVerificationSkipped: true, role: "member" },
  });
  expect(sent).toHaveLength(0);
  configured = true;
  expect(
    (
      await post("sign-in/email", {
        email: "initial@example.test",
        password: "no-mail-password-123",
      })
    ).status,
  ).toBe(200);
  const later = await signup("later@example.test");
  expect(later.headers.getSetCookie().join(";")).not.toContain("session_token");
  expect(await later.json()).toMatchObject({
    user: { emailVerified: false, emailVerificationSkipped: false, role: "member" },
  });
  expect(sent).toHaveLength(1);
  expect(
    (await post("sign-in/email", { email: "later@example.test", password: "no-mail-password-123" }))
      .status,
  ).toBe(403);
  configured = false;
  const admitted = await post("sign-in/email", {
    email: "later@example.test",
    password: "no-mail-password-123",
  });
  expect(admitted.status).toBe(200);
  const cookie = admitted.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const session = await auth.handler(
    new Request("http://localhost:3002/api/auth/get-session", { headers: { cookie } }),
  );
  expect(await session.json()).toMatchObject({
    user: { emailVerified: false, emailVerificationSkipped: true },
  });
});

it("retains production signup rate limits when mail verification is skipped", async () => {
  const auth = createAuth({
    database: memoryAdapter({
      user: [],
      account: [],
      session: [],
      verification: [],
      rateLimit: [],
    }),
    config: {
      baseURL: "https://api.example.test",
      secret: "rate-limit-test-secret-at-least-32-characters",
      trustedOrigins: ["https://web.example.test"],
      production: true,
      ipAddressHeaders: ["x-fixture-ip"],
    },
    mailer: {
      available: async () => false,
      sendVerification: async () => {
        throw new Error("No mail should be sent");
      },
      sendPasswordReset: async () => {},
    },
  });
  const statuses: number[] = [];
  for (let index = 0; index < 8; index++) {
    const result = await auth.handler(
      new Request("https://api.example.test/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          origin: "https://web.example.test",
          "content-type": "application/json",
          "x-fixture-ip": "127.0.0.1",
        },
        body: JSON.stringify({
          email: `rate-${index}@example.test`,
          name: "Rate Fixture",
          password: "rate-fixture-password-123",
        }),
      }),
    );
    statuses.push(result.status);
  }
  expect(statuses[0]).toBe(200);
  expect(statuses).toContain(429);
});
