import type { MailSettingsFallback } from "@voidmix/core";
import { describe, expect, it } from "vite-plus/test";
import { InMemorySystemSettingsRepository } from "./memory.js";
import { PostgresSystemSettingsRepository } from "./postgres.js";
import { systemSecrets, systemSettings } from "./schema.js";

class FakePostgresDatabase {
  readonly tables = new Map<
    unknown,
    Array<{ key: string; value: string; updatedAt: Date; updatedBy: null }>
  >();

  constructor(options: { settings: Record<string, string>; secrets: Record<string, string> }) {
    for (const [table, values] of [
      [systemSettings, options.settings],
      [systemSecrets, options.secrets],
    ] as const)
      this.tables.set(
        table,
        Object.entries(values).map(([key, value]) => ({
          key,
          value,
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedBy: null,
        })),
      );
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: () => {
          const rows = this.tables.get(table)!;
          return Object.assign(Promise.resolve(rows), {
            limit: async (limit: number) => rows.slice(0, limit),
          });
        },
      }),
    };
  }
}

const fallback: MailSettingsFallback = {
  enabled: { value: true, source: "default" },
  from: { value: "environment@example.com", source: "environment" },
  fromName: { value: "Voidmix", source: "default" },
  templatesBaseUrl: { value: null, source: "missing" },
  resendApiKey: { value: "environment-key", source: "environment" },
};

describe("settings adapter parity", () => {
  it.each([
    { settings: {}, secrets: {} },
    {
      settings: {
        "auth.registration_mode": "closed",
        "auth.allowed_email_domains": '["example.com"]',
        "mail.welcome_enabled": "false",
        "mail.from": "database@example.com",
      },
      secrets: { "mail.resend_api_key": "database-key" },
    },
  ])("resolves the same retained Auth and Mail configuration in both adapters", async (options) => {
    const database = new FakePostgresDatabase(options);
    const postgres = new PostgresSystemSettingsRepository(
      database as unknown as ConstructorParameters<typeof PostgresSystemSettingsRepository>[0],
    );
    const memory = new InMemorySystemSettingsRepository(options);
    expect(await postgres.resolveAuthSettings()).toEqual(await memory.resolveAuthSettings());
    expect(await postgres.resolveMailConfiguration(fallback)).toEqual(
      await memory.resolveMailConfiguration(fallback),
    );
  });
});
