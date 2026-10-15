import { expect, it, vi } from "vite-plus/test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, projectAuthUser, recipientLocale } from "./server.js";
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
