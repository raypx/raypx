import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Binding {
  deviceId: string;
  epoch: number;
}
export interface Settings {
  installationId: string;
  accounts: Record<string, { enabled: boolean; binding?: Binding; pendingRevoke?: Binding }>;
}

/** Read existing settings without creating directories, identities or network owners. */
export function readRemoteControlSettings(directory: string): Settings | undefined {
  const path = join(directory, "remote-control.json");
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, "utf8");
  if (raw.length > 64 * 1024) throw new Error("Settings exceed limit");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid settings");
  const data = value as Record<string, unknown>;
  if (
    typeof data.installationId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(data.installationId) ||
    !data.accounts ||
    typeof data.accounts !== "object" ||
    Array.isArray(data.accounts)
  )
    throw new Error("Invalid settings");
  const accounts: Settings["accounts"] = {};
  for (const [id, rawAccount] of Object.entries(data.accounts)) {
    if (!rawAccount || typeof rawAccount !== "object" || Array.isArray(rawAccount))
      throw new Error("Invalid account settings");
    const item = rawAccount as Record<string, unknown>;
    if (typeof item.enabled !== "boolean") throw new Error("Invalid account settings");
    const binding = (rawBinding: unknown): Binding => {
      if (!rawBinding || typeof rawBinding !== "object") throw new Error("Invalid binding");
      const candidate = rawBinding as Record<string, unknown>;
      if (
        typeof candidate.deviceId !== "string" ||
        !Number.isSafeInteger(candidate.epoch) ||
        Number(candidate.epoch) < 1
      )
        throw new Error("Invalid binding");
      return { deviceId: candidate.deviceId, epoch: Number(candidate.epoch) };
    };
    accounts[id] = {
      enabled: item.enabled,
      ...(item.binding ? { binding: binding(item.binding) } : {}),
      ...(item.pendingRevoke ? { pendingRevoke: binding(item.pendingRevoke) } : {}),
    };
  }
  return { installationId: data.installationId, accounts };
}
