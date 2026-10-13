import { describe, expect, it } from "vite-plus/test";
import { InMemorySystemSettingsRepository } from "./repositories/settings/memory.js";

const fallback = {
  enabled: { value: true, source: "default" },
  from: { value: "environment@example.com", source: "environment" },
  fromName: { value: "Environment", source: "environment" },
  templatesBaseUrl: { value: "https://environment.example.com", source: "environment" },
  resendApiKey: { value: "environment-key", source: "environment" },
} as const;

describe("InMemorySystemSettingsRepository", () => {
  it("continues resolving persisted authentication policy without an administration service", async () => {
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    const repository = new InMemorySystemSettingsRepository({
      settings: {
        "auth.registration_mode": "closed",
        "auth.allowed_email_domains": '["EXAMPLE.COM", "example.com", " studio.example "]',
        "mail.welcome_enabled": "false",
        "mail.verification_enabled": "true",
        "mail.password_reset_enabled": "false",
      },
      updatedAt,
    });
    await expect(repository.resolveAuthSettings()).resolves.toEqual({
      registrationMode: "closed",
      allowedEmailDomains: ["example.com", "studio.example"],
      welcomeEmailEnabled: false,
      verificationEmailEnabled: true,
      passwordResetEmailEnabled: false,
      updatedAt,
    });
  });

  it.each(['{"domain":"example.com"}', "invalid-json", '["example.com",false]'])(
    "falls back when stored email-domain policy is malformed: %s",
    async (value) => {
      const repository = new InMemorySystemSettingsRepository({
        settings: { "auth.allowed_email_domains": value },
      });
      expect((await repository.resolveAuthSettings()).allowedEmailDomains).toEqual([]);
    },
  );

  it("uses persisted mail overrides and secrets while inheriting unspecified fields", async () => {
    const repository = new InMemorySystemSettingsRepository({
      settings: { "mail.from": "database@example.com" },
      secrets: { "mail.resend_api_key": "database-key" },
    });
    await expect(repository.resolveMailConfiguration(fallback)).resolves.toEqual({
      settings: {
        enabled: true,
        from: "database@example.com",
        fromName: "Environment",
        templatesBaseUrl: "https://environment.example.com",
        configurationState: "ready",
        missing: [],
      },
      resendApiKey: "database-key",
    });
  });

  it("preserves disabled and incomplete delivery states", async () => {
    const missing = {
      ...fallback,
      from: { value: null, source: "missing" },
      resendApiKey: { value: null, source: "missing" },
    } as const;
    const repository = new InMemorySystemSettingsRepository();
    expect((await repository.resolveMailConfiguration(missing)).settings).toMatchObject({
      configurationState: "incomplete",
      missing: ["RESEND_API_KEY", "MAIL_FROM"],
    });
    const disabled = new InMemorySystemSettingsRepository({
      settings: { "mail.enabled": "false" },
    });
    expect((await disabled.resolveMailConfiguration(missing)).settings).toMatchObject({
      configurationState: "disabled",
      missing: [],
    });
  });
});
