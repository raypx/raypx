import type { AuditEvent, UpdateAuthSettingsInput, UpdateMailSettingsInput } from "@voidmix/core";
import type { UpdateSetting } from "@voidmix/shared";
import { operationKey, type StoredConfigurationValue } from "./values.js";

interface Mutation {
  key: string;
  value: string | null;
  action: "set" | "reset" | "replace";
}
export interface SettingChange extends Mutation {
  operation: string;
}

function mutation<T>(
  key: string,
  input: UpdateSetting<T> | undefined,
  serialize: (value: T) => string,
): Mutation | undefined {
  return (
    input && {
      key,
      action: input.action,
      value: input.action === "reset" ? null : serialize(input.value),
    }
  );
}

export function authMutations(input: UpdateAuthSettingsInput) {
  return [
    mutation("auth.registration_mode", input.registrationMode, String),
    mutation("auth.allowed_email_domains", input.allowedEmailDomains, JSON.stringify),
    mutation("mail.welcome_enabled", input.welcomeEmailEnabled, String),
    mutation("mail.verification_enabled", input.verificationEmailEnabled, String),
    mutation("mail.password_reset_enabled", input.passwordResetEmailEnabled, String),
  ];
}

export function mailMutations(input: UpdateMailSettingsInput) {
  const trim = (value: string) => value.trim();
  return [
    mutation("mail.enabled", input.enabled, String),
    mutation("mail.from", input.from, trim),
    mutation("mail.from_name", input.fromName, trim),
    mutation("mail.templates_base_url", input.templatesBaseUrl, trim),
  ];
}

export function secretMutations(input: UpdateMailSettingsInput): Array<Mutation | undefined> {
  const value = input.resendApiKey;
  return [
    value && {
      key: "mail.resend_api_key",
      action: value.action,
      value: value.action === "reset" ? null : value.value.trim(),
    },
  ];
}

/** Compute changed keys without exposing their values to audit reporting. */
export function changesFor(
  existing: ReadonlyMap<string, StoredConfigurationValue>,
  mutations: Array<Mutation | undefined>,
): SettingChange[] {
  return mutations.flatMap((change) => {
    if (
      !change ||
      (change.value === null
        ? !existing.has(change.key)
        : existing.get(change.key)?.value === change.value)
    )
      return [];
    return [{ ...change, operation: `${change.key}:${change.action}` }];
  });
}

export function changedAudit(audit: AuditEvent, changes: SettingChange[]): AuditEvent {
  const operations = changes.map((change) => change.operation);
  return {
    ...audit,
    metadata: {
      fields: operations.map(operationKey).join(","),
      operations: operations.join(","),
      result: "updated",
    },
  };
}

export function applyMemoryChanges(
  store: Map<string, StoredConfigurationValue>,
  changes: SettingChange[],
  input: { actorId: string; audit: AuditEvent },
): void {
  for (const { key, value } of changes) {
    if (value === null) store.delete(key);
    else
      store.set(key, {
        value,
        updatedAt: new Date(input.audit.occurredAt),
        updatedBy: input.actorId,
      });
  }
}
