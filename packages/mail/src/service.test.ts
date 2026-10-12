import { describe, expect, it, vi } from "vite-plus/test";

import { getMailEnv } from "./env.js";
import { createMailer, MailUnavailableError } from "./service.js";
import type { MailTransport } from "./types.js";

const developmentEnv = getMailEnv({
  NODE_ENV: "development",
  MAIL_FROM: "mail@example.com",
  MAIL_FROM_NAME: "Voidmix",
  EMAIL_TEMPLATES_BASE_URL: "https://admin.example.com",
});

describe("mailer", () => {
  it("renders and sends each typed authentication email", async () => {
    const send = vi.fn<MailTransport["send"]>(async () => ({ ok: true, id: "sent" }));
    const mailer = createMailer({ env: developmentEnv, transport: { send } });

    await mailer.sendVerification({
      email: "alex@example.com",
      name: "Alex",
      url: "https://admin.example.com/verify?token=private",
    });
    await mailer.sendPasswordReset({
      email: "alex@example.com",
      url: "https://admin.example.com/reset?token=private",
    });
    await mailer.sendWelcome({ email: "alex@example.com", name: "Alex" });

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(([value]) => value.template)).toEqual([
      "email-verification",
      "password-reset",
      "welcome",
    ]);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      from: { email: "mail@example.com", name: "Voidmix" },
      to: { email: "alex@example.com", name: "Alex" },
    });
  });

  it("surfaces transport failures", async () => {
    const mailer = createMailer({
      env: developmentEnv,
      transport: { send: async () => ({ ok: false, error: "provider rejected message" }) },
    });

    await expect(mailer.sendWelcome({ email: "alex@example.com", name: "Alex" })).rejects.toThrow(
      "Failed to send welcome email: provider rejected message",
    );
  });
});

describe("mail environment", () => {
  it("uses a network-free development fallback configuration", () => {
    expect(getMailEnv({ NODE_ENV: "test" })).toMatchObject({
      NODE_ENV: "test",
      MAIL_FROM: "noreply@voidmix.local",
      MAIL_FROM_NAME: "Voidmix",
      MAIL_DEFAULT_LOCALE: "en",
    });
  });

  it("normalizes the configured mail locale and falls back to English", () => {
    expect(getMailEnv({ NODE_ENV: "test", MAIL_DEFAULT_LOCALE: "zh-CN" }).MAIL_DEFAULT_LOCALE).toBe(
      "zh",
    );
    expect(getMailEnv({ NODE_ENV: "test", MAIL_DEFAULT_LOCALE: "fr" }).MAIL_DEFAULT_LOCALE).toBe(
      "en",
    );
  });

  it("allows production startup and reports unavailable mail only when sending", async () => {
    const env = getMailEnv({ NODE_ENV: "production" });
    const mailer = createMailer({ env });

    expect(env.MAIL_FROM).toBeNull();
    await expect(mailer.sendWelcome({ email: "alex@example.com" })).rejects.toMatchObject({
      code: "MAIL_NOT_CONFIGURED",
      missing: ["RESEND_API_KEY", "MAIL_FROM"],
    } satisfies Partial<MailUnavailableError>);
  });

  it("resolves the latest configuration for every send", async () => {
    let from = "first@example.com";
    const send = vi.fn<MailTransport["send"]>(async () => ({ ok: true, id: "sent" }));
    const mailer = createMailer({
      env: getMailEnv({ NODE_ENV: "production" }),
      transport: { send },
      resolveConfiguration: async () => ({
        enabled: true,
        from,
        fromName: "Voidmix",
        templatesBaseUrl: null,
        resendApiKey: "resend-key",
      }),
    });

    await mailer.sendWelcome({ email: "alex@example.com" });
    from = "second@example.com";
    await mailer.sendWelcome({ email: "alex@example.com" });

    expect(send.mock.calls.map(([message]) => message.from.email)).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
  });

  it.each([
    ["recipient override", "en", { locale: "zh" }],
    ["deployment fallback", "zh", {}],
  ] as const)(
    "selects the verification language from %s",
    async (_name, defaultLocale, recipient) => {
      const send = vi.fn<MailTransport["send"]>(async () => ({ ok: true, id: "sent" }));
      const mailer = createMailer({
        env: { ...developmentEnv, MAIL_DEFAULT_LOCALE: defaultLocale },
        transport: { send },
      });
      await mailer.sendVerification({
        email: "alex@example.com",
        name: "Alex",
        url: "https://admin.example.com/verify?token=private",
        ...recipient,
      });
      const [message] = send.mock.calls[0]!;
      expect(message.subject).toBe("验证你的 Voidmix 邮箱");
      expect(message.html).toContain('lang="zh"');
    },
  );
});
