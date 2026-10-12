import { SettingsReader } from "./reader.js";
import { type StoredConfigurationValue } from "./values.js";
import type { AuditEvent, SystemSettingsRepository } from "@voidmix/core";
import {
  authMutations,
  mailMutations,
  secretMutations,
  changesFor,
  changedAudit,
  applyMemoryChanges,
} from "./mutations.js";

export class InMemorySystemSettingsRepository
  extends SettingsReader
  implements SystemSettingsRepository
{
  readonly settings = new Map<string, StoredConfigurationValue>();
  readonly secrets = new Map<string, StoredConfigurationValue>();
  readonly auditEvents: AuditEvent[];

  constructor(
    options: {
      settings?: Readonly<Record<string, string>>;
      secrets?: Readonly<Record<string, string>>;
      auditEvents?: AuditEvent[];
      updatedAt?: Date;
    } = {},
  ) {
    super();
    const updatedAt = options.updatedAt ?? new Date("2026-01-01T00:00:00.000Z");
    for (const [key, value] of Object.entries(options.settings ?? {})) {
      this.settings.set(key, { value, updatedAt: new Date(updatedAt), updatedBy: null });
    }
    for (const [key, value] of Object.entries(options.secrets ?? {})) {
      this.secrets.set(key, { value, updatedAt: new Date(updatedAt), updatedBy: null });
    }
    this.auditEvents = options.auditEvents ?? [];
  }

  protected readSettings(keys: readonly string[]) {
    return keys.flatMap((key) => {
      const row = this.settings.get(key);
      return row ? [{ key, ...row }] : [];
    });
  }

  protected readSecret(key: string) {
    return this.secrets.get(key) ?? null;
  }

  async updateAuthSettings(input: Parameters<SystemSettingsRepository["updateAuthSettings"]>[0]) {
    const changes = changesFor(this.settings, authMutations(input.settings));
    applyMemoryChanges(this.settings, changes, input);
    const current = await this.getAuthSettings();
    if (changes.length) this.auditEvents.push(changedAudit(input.audit, changes));
    return current;
  }

  async updateMailSettings(input: Parameters<SystemSettingsRepository["updateMailSettings"]>[0]) {
    const changes = changesFor(this.settings, mailMutations(input.settings));
    applyMemoryChanges(this.settings, changes, input);
    const secrets = changesFor(this.secrets, secretMutations(input.settings));
    applyMemoryChanges(this.secrets, secrets, input);
    changes.push(...secrets);
    const current = await this.getMailSettings(input.fallback);
    if (changes.length) this.auditEvents.push(changedAudit(input.audit, changes));
    return current;
  }
}
