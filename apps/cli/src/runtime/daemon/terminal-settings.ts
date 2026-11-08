import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { localParams } from "@raypx/contracts/local";

export const terminalSettingsSchema = localParams["approvals.local.configure"];
export const cloudTerminalSchema = z.object({
  enabled: z.boolean(),
  rootIds: z.array(z.uuid()).max(200),
});
const savedSchema = z.object({
  version: z.literal(1),
  local: terminalSettingsSchema,
  clouds: z.record(z.string(), cloudTerminalSchema),
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

/** Missing settings start with local approval and cloud sharing disabled. */
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
  };
  writeTerminalConfiguration(directory, value);
  return value;
}
