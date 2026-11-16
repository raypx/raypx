import type { Database } from "@raypx/database/connection";
import { sandboxConfiguration } from "@raypx/database/schema";
import { sandboxUpdateSchema, type SandboxSettingsUpdate } from "@raypx/contracts/api";
import { configurationCipher } from "./credentials.js";
import { ConfigError } from "./service.js";

export const sandboxSettingsId = "sandbox";
export const e2bBaseTemplate = "base";
export function sandboxCipher(secret: string) {
  return configurationCipher(secret, "raypx/sandbox-configuration/v1", sandboxSettingsId);
}
export function sandboxCredentialTarget(row: { provider: string; url: string | null }) {
  if (row.provider === "e2b") return "e2b:https://api.e2b.app";
  return row.url ?? "";
}

export async function initializeSandbox(
  db: Pick<Database, "insert">,
  secret: string,
  input: SandboxSettingsUpdate,
) {
  const { values, credential } = sandboxUpdateSchema.parse(input);
  if (values.provider !== "none" && !credential) throw new ConfigError("INVALID_INPUT");
  const credentials = credential
    ? await sandboxCipher(secret).seal(credential, sandboxCredentialTarget(values))
    : null;
  await db
    .insert(sandboxConfiguration)
    .values({
      id: sandboxSettingsId,
      ...values,
      credentials,
      revision: 1,
      template: values.provider === "e2b" ? e2bBaseTemplate : null,
    })
    .onConflictDoNothing();
}
