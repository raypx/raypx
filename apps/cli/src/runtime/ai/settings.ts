import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { parseAiSettings, type AiSettings } from "@raypx/ai/config";
import { LocalError } from "../errors";

/** Read-only user config shared by direct model calls and managed Pi sessions. */
export function loadAiSettings(): AiSettings {
  const directory = process.env.RAYPX_HOME ?? join(homedir(), ".raypx");
  if (!isAbsolute(directory))
    throw new LocalError("AI_INVALID_CONFIG", "RAYPX_HOME must be absolute.");
  try {
    const file = join(directory, "config.toml");
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 16 * 1024) throw new Error();
    const value = Bun.TOML.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    return parseAiSettings(value.ai);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw new LocalError("AI_INVALID_CONFIG", "Unable to read AI settings from config.toml.");
  }
}
