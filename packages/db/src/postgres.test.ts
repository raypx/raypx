import type { AuditEvent, MailSettingsFallback } from "@voidmix/core";
import { describe, expect, it } from "vite-plus/test";

import { PostgresSystemSettingsRepository } from "./postgres.js";
import { auditEvents, systemSecrets, systemSettings } from "./schema.js";

interface StoredRow {
  key: string;
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}

class FakePostgresDatabase {
  readonly settings = new Map<string, StoredRow>();
  readonly secrets = new Map<string, StoredRow>();
  readonly audits: Array<Record<string, unknown>> = [];
  private readonly tables = new Map<unknown, { rows: Map<string, StoredRow>; deletes: string[] }>();

  constructor(
    options: {
      settings?: Record<string, string>;
      secrets?: Record<string, string>;
      settingDeletes?: string[];
      secretDeletes?: string[];
    } = {},
  ) {
    for (const [table, rows, values, deletes] of [
      [systemSettings, this.settings, options.settings, options.settingDeletes],
      [systemSecrets, this.secrets, options.secrets, options.secretDeletes],
    ] as const) {
      this.tables.set(table, { rows, deletes: [...(deletes ?? [])] });
      for (const [key, value] of Object.entries(values ?? {}))
        rows.set(key, {
          key,
          value,
          updatedAt: new Date("2026-08-24T00:00:00.000Z"),
          updatedBy: null,
        });
    }
  }

  async transaction<Result>(run: (tx: FakePostgresDatabase) => Promise<Result>): Promise<Result> {
    return run(this);
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: () => {
          const rows = [...this.tables.get(table)!.rows.values()];
          return Object.assign(Promise.resolve(rows), {
            limit: async (limit: number) => rows.slice(0, limit),
          });
        },
      }),
    };
  }

  delete(table: unknown) {
    return {
      where: async () => {
        const { rows, deletes } = this.tables.get(table)!;
        const key = deletes.shift();
        if (key) rows.delete(key);
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (row: StoredRow) => {
        if (table === auditEvents) {
          this.audits.push({ ...row });
          return Promise.resolve();
        }
        return {
          onConflictDoUpdate: async () => {
            this.tables.get(table)!.rows.set(row.key, { ...row });
          },
        };
      },
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

function repository(database: FakePostgresDatabase): PostgresSystemSettingsRepository {
  return new PostgresSystemSettingsRepository(
    database as unknown as ConstructorParameters<typeof PostgresSystemSettingsRepository>[0],
  );
}

function audit(id: string, targetId: "auth" | "mail"): AuditEvent {
  return {
    id,
    actorId: "owner-1",
    action: "system.settings.updated",
    targetType: "system_setting",
    targetId,
    targetUserId: null,
    occurredAt: new Date("2026-08-24T02:00:00.000Z"),
    metadata: {},
  };
}

describe("PostgresSystemSettingsRepository", () => {
  it("deletes an Auth override, upserts only submitted fields, and audits operations", async () => {
    const database = new FakePostgresDatabase({
      settings: { "auth.registration_mode": "closed" },
      settingDeletes: ["auth.registration_mode"],
    });

    const updated = await repository(database).updateAuthSettings({
      actorId: "owner-1",
      settings: {
        registrationMode: { action: "reset" },
        allowedEmailDomains: { action: "set", value: ["example.com"] },
      },
      audit: audit("audit-auth", "auth"),
    });

    expect(database.settings.has("auth.registration_mode")).toBe(false);
    expect(database.settings.get("auth.allowed_email_domains")?.value).toBe('["example.com"]');
    expect(updated).toMatchObject({
      registrationMode: "open",
      sources: { registrationMode: "default", allowedEmailDomains: "database" },
    });
    expect(database.audits[0]?.metadata).toEqual({
      fields: "auth.registration_mode,auth.allowed_email_domains",
      operations: "auth.registration_mode:reset,auth.allowed_email_domains:set",
      result: "updated",
    });
    expect(JSON.stringify(database.audits)).not.toContain("example.com");
  });

  it("resets mail and secret rows to environment fallbacks in one transaction result", async () => {
    const database = new FakePostgresDatabase({
      settings: { "mail.from": "database@example.com" },
      secrets: { "mail.resend_api_key": "database-key" },
      settingDeletes: ["mail.from"],
      secretDeletes: ["mail.resend_api_key"],
    });

    const updated = await repository(database).updateMailSettings({
      actorId: "owner-1",
      settings: {
        from: { action: "reset" },
        fromName: { action: "set", value: "Database sender" },
        resendApiKey: { action: "reset" },
      },
      fallback,
      audit: audit("audit-mail", "mail"),
    });

    expect([...database.settings.keys()]).toEqual(["mail.from_name"]);
    expect(database.secrets.size).toBe(0);
    expect(updated).toMatchObject({
      from: "environment@example.com",
      fromName: "Database sender",
      sources: { from: "environment", fromName: "database" },
      resendApiKey: { configured: true, source: "environment" },
    });
    expect(JSON.stringify(database.audits)).not.toContain("database-key");
    expect(JSON.stringify(database.audits)).not.toContain("environment-key");
  });

  it("does not write or audit absent reset operations", async () => {
    const database = new FakePostgresDatabase();

    await repository(database).updateAuthSettings({
      actorId: "owner-1",
      settings: { registrationMode: { action: "reset" } },
      audit: audit("audit-noop", "auth"),
    });

    expect(database.settings.size).toBe(0);
    expect(database.audits).toHaveLength(0);
  });
});

describe("settings adapter parity", () => {
  it("preserves omission, set, reset, inheritance and redacted no-op auditing", async () => {
    const database = new FakePostgresDatabase({
      settingDeletes: ["auth.registration_mode"],
      secretDeletes: ["mail.resend_api_key"],
    });
    const { InMemorySystemSettingsRepository } = await import("./memory.js");
    const memory = new InMemorySystemSettingsRepository();
    const postgres = repository(database);
    for (const settings of [
      { registrationMode: { action: "set", value: "closed" } },
      {},
      { registrationMode: { action: "set", value: "closed" } },
      { registrationMode: { action: "reset" } },
      { registrationMode: { action: "reset" } },
    ] as const) {
      const input = { actorId: "owner-1", settings, audit: audit("auth-parity", "auth") };
      expect(await postgres.updateAuthSettings(input)).toEqual(
        await memory.updateAuthSettings(input),
      );
      expect(database.audits.map((row) => row.metadata)).toEqual(
        memory.auditEvents.map((row) => row.metadata),
      );
    }
    expect(database.audits).toHaveLength(2);
    for (const settings of [
      { resendApiKey: { action: "replace", value: "private-key" } },
      {},
      { resendApiKey: { action: "replace", value: "private-key" } },
      { resendApiKey: { action: "reset" } },
      { resendApiKey: { action: "reset" } },
    ] as const) {
      const input = { actorId: "owner-1", settings, fallback, audit: audit("mail-parity", "mail") };
      expect(await postgres.updateMailSettings(input)).toEqual(
        await memory.updateMailSettings(input),
      );
      expect(await postgres.resolveMailConfiguration(fallback)).toEqual(
        await memory.resolveMailConfiguration(fallback),
      );
    }
    expect(database.audits).toHaveLength(4);
    expect(database.audits.map((row) => row.metadata)).toEqual(
      memory.auditEvents.map((row) => row.metadata),
    );
    expect(JSON.stringify(database.audits)).not.toContain("private-key");
  });
});
