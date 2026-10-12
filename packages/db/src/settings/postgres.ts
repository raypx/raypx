import { SettingsReader } from "./reader.js";
import { toAuditInsert } from "../audit.js";
import {
  mailSettingKeys,
  mailSecretKey,
  authSettingKeys,
  resolveAuthSettings,
  resolveMailSettings,
} from "./values.js";
import type { AuditEvent, SystemSettingsRepository } from "@voidmix/core";
import {
  authMutations,
  mailMutations,
  secretMutations,
  changesFor,
  changedAudit,
  type SettingChange,
} from "./mutations.js";
import type { SettingRow } from "./values.js";
import { eq, inArray } from "drizzle-orm";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditEvents, systemSecrets, systemSettings } from "../schema.js";

export class PostgresSystemSettingsRepository
  extends SettingsReader
  implements SystemSettingsRepository
{
  constructor(private readonly db: PostgresJsDatabase) {
    super();
  }

  protected async readSettings(keys: readonly string[]) {
    return this.db
      .select()
      .from(systemSettings)
      .where(inArray(systemSettings.key, [...keys]));
  }

  protected async readSecret(key: string) {
    const [row] = await this.db
      .select()
      .from(systemSecrets)
      .where(eq(systemSecrets.key, key))
      .limit(1);
    return row ?? null;
  }

  async updateAuthSettings(input: Parameters<SystemSettingsRepository["updateAuthSettings"]>[0]) {
    return this.db.transaction(async (tx) => {
      const settingRows = await tx
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, [...authSettingKeys]));
      const existingSettings = new Map(settingRows.map((row) => [row.key, row]));
      const changes = changesFor(existingSettings, authMutations(input.settings));
      await persistChanges(tx, systemSettings, existingSettings, changes, input);

      const current = resolveAuthSettings([...existingSettings.values()]);
      if (changes.length)
        await tx.insert(auditEvents).values(toAuditInsert(changedAudit(input.audit, changes)));
      return current;
    });
  }

  async updateMailSettings(input: Parameters<SystemSettingsRepository["updateMailSettings"]>[0]) {
    return this.db.transaction(async (tx) => {
      const settingRows = await tx
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, [...mailSettingKeys]));
      const [secretRow] = await tx
        .select()
        .from(systemSecrets)
        .where(eq(systemSecrets.key, mailSecretKey))
        .limit(1);
      const existingSettings = new Map(settingRows.map((row) => [row.key, row]));
      const changes = changesFor(existingSettings, mailMutations(input.settings));
      await persistChanges(tx, systemSettings, existingSettings, changes, input);

      const secrets = new Map(secretRow ? [[secretRow.key, secretRow]] : []);
      const secretChanges = changesFor(secrets, secretMutations(input.settings));
      await persistChanges(tx, systemSecrets, secrets, secretChanges, input);
      changes.push(...secretChanges);

      const current = resolveMailSettings(
        [...existingSettings.values()],
        secrets.get(mailSecretKey) ?? null,
        input.fallback,
      );
      if (changes.length)
        await tx.insert(auditEvents).values(toAuditInsert(changedAudit(input.audit, changes)));
      return current;
    });
  }
}

async function persistChanges(
  tx: PostgresJsDatabase,
  table: typeof systemSettings | typeof systemSecrets,
  existing: Map<string, SettingRow>,
  changes: SettingChange[],
  input: { actorId: string; audit: AuditEvent },
): Promise<void> {
  await Promise.all(
    changes.map(async ({ key, value }) => {
      if (value === null) {
        await tx.delete(table).where(eq(table.key, key));
        existing.delete(key);
        return;
      }
      const row = { key, value, updatedAt: input.audit.occurredAt, updatedBy: input.actorId };
      await tx.insert(table).values(row).onConflictDoUpdate({ target: table.key, set: row });
      existing.set(key, row);
    }),
  );
}
