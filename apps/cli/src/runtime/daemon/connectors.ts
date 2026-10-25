import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { AgentProvider } from "@raypx/contracts/tasks";
import { applyHookSettings, planHookSettings, readHookSettings } from "../terminal/settings";
import { LocalError } from "../errors";
import { acquireLock } from "../state";

export function raypxHome() {
  const directory = process.env.RAYPX_HOME ?? join(homedir(), ".raypx");
  if (!isAbsolute(directory))
    throw new LocalError("INVALID_CONFIG_PATH", "RAYPX_HOME must be absolute");
  return directory;
}
export const stableCliPath = () => join(raypxHome(), "bin", "raypx");
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export function connectorCommand(directory: string, provider: AgentProvider) {
  return [
    stableCliPath(),
    "connectors",
    "hook",
    provider,
    "--data-dir",
    dirname(dirname(directory)),
    "--profile",
    basename(directory),
  ]
    .map(quote)
    .join(" ");
}
export function planConnectorSettings(
  provider: AgentProvider,
  text: string | null,
  command: string,
  action: "install" | "uninstall",
) {
  const plan = planHookSettings(provider, text, command, action);
  if (action === "install" && text) {
    const groups = JSON.parse(text).hooks?.PermissionRequest ?? [];
    for (const group of groups)
      for (const handler of group.hooks) {
        if (
          typeof handler.command === "string" &&
          handler.command !== command &&
          /(?:^|\/)raypx' 'connectors' 'hook' /.test(handler.command)
        )
          throw new LocalError(
            "HOOK_OTHER_PROFILE",
            "Remove the other Raypx profile's hook before connecting this profile",
          );
      }
  }
  return plan;
}
function settingsFile(provider: AgentProvider) {
  const directory =
    provider === "claude"
      ? (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"))
      : (process.env.CODEX_HOME ?? join(homedir(), ".codex"));
  if (!isAbsolute(directory))
    throw new LocalError("INVALID_SETTINGS_PATH", "Agent config directory must be absolute");
  return join(directory, provider === "claude" ? "settings.json" : "hooks.json");
}
const source = async (file: string) => (await readHookSettings(file))?.text ?? null;

/** Copy only the compiled host to a stable, explicitly owned installation. */
export function installStableCli() {
  if (process.platform !== "darwin")
    throw new LocalError(
      "UNSUPPORTED_PLATFORM",
      "Stable host installation currently supports macOS",
    );
  if (/(?:^|[/\\])bun(?:\.exe)?$/.test(process.execPath))
    throw new LocalError(
      "COMPILED_CLI_REQUIRED",
      "Build Raypx before installing terminal connectors",
    );
  const binary = stableCliPath(),
    directory = dirname(binary),
    ownership = join(directory, "installation.json");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const release = acquireLock(directory, "installation");
  if (!release) throw new LocalError("INSTALLATION_BUSY", "Another Raypx installation is running");
  try {
    const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    if (existsSync(binary)) {
      if (!existsSync(ownership))
        throw new LocalError(
          "INSTALLATION_CONFLICT",
          "Existing executable is not owned by this Raypx installer",
        );
      const old = JSON.parse(readFileSync(ownership, "utf8"));
      if (old.digest !== digest(binary))
        throw new LocalError("INSTALLATION_CONFLICT", "Installed executable changed outside Raypx");
    }
    if (binary !== process.execPath) {
      const temporary = `${binary}.${crypto.randomUUID()}.tmp`;
      copyFileSync(process.execPath, temporary);
      chmodSync(temporary, 0o755);
      renameSync(temporary, binary);
    }
    const temporary = `${ownership}.tmp`;
    writeFileSync(temporary, JSON.stringify({ digest: digest(binary) }), { mode: 0o600 });
    renameSync(temporary, ownership);
    return binary;
  } finally {
    release();
  }
}
export async function connectorStatus(directory: string) {
  return Promise.all(
    (["claude", "codex"] as const).map(async (provider) => {
      try {
        const plan = planHookSettings(
          provider,
          await source(settingsFile(provider)),
          connectorCommand(directory, provider),
          "uninstall",
        );
        return {
          provider,
          installed: plan.changed,
          modified: plan.preservedModified,
          requiresTrust: provider === "codex",
          error: null,
        };
      } catch (error) {
        return {
          provider,
          installed: false,
          modified: false,
          requiresTrust: provider === "codex",
          error: error instanceof LocalError ? error.code : "SETTINGS_UNAVAILABLE",
        };
      }
    }),
  );
}
export async function connectorAction(
  directory: string,
  provider: AgentProvider,
  action: "install" | "uninstall",
) {
  const file = settingsFile(provider);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const release = acquireLock(dirname(file), "raypx-hooks");
  if (!release)
    throw new LocalError("INSTALLATION_BUSY", "Another Raypx hook installation is running");
  try {
    const command = connectorCommand(directory, provider),
      plan = planConnectorSettings(provider, await source(file), command, action);
    if (action === "install") installStableCli();
    const result = await applyHookSettings(file, plan);
    return {
      ...result,
      provider,
      requiresTrust: plan.requiresTrust,
      preservedModified: plan.preservedModified,
    };
  } finally {
    release();
  }
}
