import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readRemoteControlSettings, serverOrigin } from "@raypx/host";
import { localParams } from "@raypx/contracts/local";
import { bindingKey, hostBindingSchema } from "./vault";

export const terminalSettingsSchema = localParams["approvals.local.configure"];
export type TerminalSettings = z.infer<typeof terminalSettingsSchema>;
export const cloudTerminalSchema = z.object({
  enabled: z.boolean(),
  rootIds: z.array(z.uuid()).max(200),
});
const savedSchema = z.object({
  version: z.literal(1),
  local: terminalSettingsSchema,
  clouds: z.record(z.string(), cloudTerminalSchema),
  migrationRequired: z.boolean(),
});
export type TerminalConfiguration = z.infer<typeof savedSchema>;
export const emptyCloud = () => ({ enabled: false, rootIds: [] as string[] });

export function writeTerminalConfiguration(directory: string, value: TerminalConfiguration) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "settings.json"),
    temporary = `${file}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(savedSchema.parse(value)), { flag: "wx", mode: 0o600 });
  renameSync(temporary, file);
}

/** Only the explicitly selected, enabled binding may seed the local settings once. */
export function readTerminalConfiguration(profile: string): TerminalConfiguration {
  const directory = join(profile, "terminal"),
    file = join(directory, "settings.json");
  if (existsSync(file)) {
    const raw = readFileSync(file, "utf8");
    if (Buffer.byteLength(raw) > 128 * 1024) throw new Error("Terminal settings exceed limit");
    return savedSchema.parse(JSON.parse(raw));
  }
  const value: TerminalConfiguration = {
    version: 1,
    local: { rootIds: [], away: false, waitSeconds: 300 },
    clouds: {},
    migrationRequired: false,
  };
  const read = (name: string) => {
    const raw = readFileSync(join(profile, name), "utf8");
    if (Buffer.byteLength(raw) > 32_000) throw new Error("Legacy settings exceed limit");
    return JSON.parse(raw) as unknown;
  };
  if (existsSync(join(profile, "host-binding.json"))) {
    try {
      const binding = hostBindingSchema.parse(read("host-binding.json"));
      const session = localParams["host.session"].parse(read("host-session.json"));
      const origin = serverOrigin(binding.apiUrl);
      if (session.accountId !== binding.accountId || serverOrigin(session.apiUrl) !== origin)
        throw new Error("Legacy binding is not selected");
      const key = bindingKey(origin, binding.accountId),
        old = join(profile, "hosts", key);
      const remote = readRemoteControlSettings(old);
      if (remote?.accounts[binding.accountId]?.enabled !== true)
        throw new Error("Legacy binding is disabled");
      const raw = readFileSync(join(old, "observed.json"), "utf8");
      if (Buffer.byteLength(raw) > 32_000) throw new Error("Legacy settings exceed limit");
      value.local = terminalSettingsSchema.parse(JSON.parse(raw));
      value.clouds[key] = { enabled: true, rootIds: [...value.local.rootIds] };
    } catch {
      value.migrationRequired = true;
    }
  } else if (existsSync(join(profile, "hosts"))) value.migrationRequired = true;
  writeTerminalConfiguration(directory, value);
  return value;
}
