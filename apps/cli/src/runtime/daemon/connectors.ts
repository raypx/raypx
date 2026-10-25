import {
  chmodSync,
  copyFileSync,
  constants,
  lstatSync,
  existsSync,
  mkdirSync,
  statSync,
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
import { cliBuild } from "./build";

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
export type ConnectorDirectories = Partial<Record<AgentProvider, string | undefined>>;
function savedDirectories(directory: string): ConnectorDirectories {
  const file = join(directory, "connector-paths.json");
  if (!existsSync(file)) return {};
  const text = readFileSync(file, "utf8");
  if (text.length > 16384)
    throw new LocalError("SETTINGS_UNAVAILABLE", "Connector paths require recovery");
  return JSON.parse(text) as ConnectorDirectories;
}
export function connectorSettingsFile(
  provider: AgentProvider,
  directory: string,
  requested: ConnectorDirectories = {},
) {
  const config = join(raypxHome(), "config.toml");
  let configured: unknown;
  if (existsSync(config)) {
    const source = readFileSync(config, "utf8");
    if (Buffer.byteLength(source) > 16384)
      throw new LocalError("INVALID_CONFIG", "Raypx config exceeds 16 KiB");
    try {
      configured = (Bun.TOML.parse(source) as Record<string, unknown>).connectors;
    } catch {
      throw new LocalError("INVALID_CONFIG", "Invalid connector configuration");
    }
  }
  if (
    configured !== undefined &&
    (!configured || typeof configured !== "object" || Array.isArray(configured))
  )
    throw new LocalError("INVALID_CONFIG", "connectors must be a table");
  const key = provider === "claude" ? "claude_config_dir" : "codex_home";
  const target =
    requested[provider] ??
    (configured as Record<string, unknown> | undefined)?.[key] ??
    (provider === "claude" ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME) ??
    savedDirectories(directory)[provider] ??
    join(homedir(), provider === "claude" ? ".claude" : ".codex");
  if (typeof target !== "string" || !isAbsolute(target))
    throw new LocalError("INVALID_SETTINGS_PATH", "Agent config directory must be absolute");
  return join(target, provider === "claude" ? "settings.json" : "hooks.json");
}
export function assertStableUpgrade(
  previous: { version?: string; builtAt?: number },
  next = cliBuild,
) {
  if (
    previous.version &&
    (Bun.semver.order(previous.version, next.version) > 0 ||
      (previous.version === next.version && (previous.builtAt ?? 0) > next.builtAt))
  )
    throw new LocalError(
      "HOST_DOWNGRADE",
      "A newer Raypx binary is already installed; use that version",
    );
}
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
export function stableCliStatus(binary = stableCliPath()) {
  const metadata = join(dirname(binary), "installation.json");
  try {
    if (!existsSync(binary)) return { error: "HOST_BINARY_MISSING", updateAvailable: false };
    if (!existsSync(metadata)) return { error: "INSTALLATION_CONFLICT", updateAvailable: false };
    const previous = JSON.parse(readFileSync(metadata, "utf8"));
    if (!lstatSync(binary).isFile())
      return { error: "INSTALLATION_CONFLICT", updateAvailable: false };
    if (previous.digest !== digest(binary))
      return {
        error: "INSTALLATION_CONFLICT",
        updateAvailable: false,
        repairable: typeof previous.digest === "string" && /^[a-f0-9]{64}$/.test(previous.digest),
      };
    const updateAvailable =
      previous.version !== cliBuild.version ||
      (cliBuild.builtAt > 0 && previous.builtAt !== cliBuild.builtAt);
    return {
      error: statSync(binary).mode & 0o111 ? null : "HOST_BINARY_NOT_EXECUTABLE",
      updateAvailable,
    };
  } catch {
    return { error: "INSTALLATION_CONFLICT", updateAvailable: false };
  }
}
export function refreshStableCli() {
  if (/(?:^|[/\\])bun(?:\.exe)?$/.test(process.execPath)) return;
  const metadata = join(dirname(stableCliPath()), "installation.json");
  if (!existsSync(metadata)) return;
  const status = stableCliStatus();
  if (status.error === "INSTALLATION_CONFLICT") return;
  // An owned installation may be repaired/upgraded, never silently downgraded.
  if (status.error || status.updateAvailable) {
    try {
      installStableCli();
    } catch {
      console.error(
        JSON.stringify({ operation: "daemon.installation", code: "HOST_UPDATE_REQUIRED" }),
      );
    }
  }
}
const source = async (file: string) => (await readHookSettings(file))?.text ?? null;

/** Only an explicitly confirmed, previously owned regular file can be replaced. */
export function preserveModifiedCli(binary: string, confirmed = false) {
  const ownership = join(dirname(binary), "installation.json");
  if (!existsSync(ownership) || !lstatSync(binary).isFile())
    throw new LocalError("INSTALLATION_CONFLICT", "Existing executable is not owned by Raypx");
  const previous = JSON.parse(readFileSync(ownership, "utf8"));
  if (typeof previous.digest !== "string" || !/^[a-f0-9]{64}$/.test(previous.digest))
    throw new LocalError(
      "INSTALLATION_CONFLICT",
      "Installation ownership requires manual recovery",
    );
  if (previous.digest === digest(binary)) return;
  if (!confirmed)
    throw new LocalError("INSTALLATION_CONFLICT", "Installed executable changed outside Raypx");
  const backup = `${binary}.backup-${crypto.randomUUID()}`;
  copyFileSync(binary, backup, constants.COPYFILE_EXCL);
  chmodSync(backup, 0o600);
  return backup;
}

/** Copy only the compiled host to a stable, explicitly owned installation. */
export function installStableCli(recoverModified = false) {
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
    if (existsSync(ownership)) assertStableUpgrade(JSON.parse(readFileSync(ownership, "utf8")));
    if (existsSync(binary)) {
      if (!existsSync(ownership))
        throw new LocalError(
          "INSTALLATION_CONFLICT",
          "Existing executable is not owned by this Raypx installer",
        );
      if (recoverModified && binary === process.execPath)
        throw new LocalError(
          "HOST_UPDATE_REQUIRED",
          "Use the trusted Desktop binary to repair this installation",
        );
      preserveModifiedCli(binary, recoverModified);
    }
    if (binary !== process.execPath) {
      const temporary = `${binary}.${crypto.randomUUID()}.tmp`;
      copyFileSync(process.execPath, temporary);
      chmodSync(temporary, 0o755);
      renameSync(temporary, binary);
    }
    const temporary = `${ownership}.tmp`;
    writeFileSync(temporary, JSON.stringify({ digest: digest(binary), ...cliBuild }), {
      mode: 0o600,
    });
    renameSync(temporary, ownership);
    return binary;
  } finally {
    release();
  }
}
export async function connectorStatus(directory: string, requested: ConnectorDirectories = {}) {
  return Promise.all(
    (["claude", "codex"] as const).map(async (provider) => {
      try {
        const file = connectorSettingsFile(provider, directory, requested);
        const plan = planHookSettings(
          provider,
          await source(file),
          connectorCommand(directory, provider),
          "uninstall",
        );
        const binary = stableCliStatus();
        return {
          provider,
          settingsFile: file,
          hookInstalled: plan.changed,
          updateAvailable: plan.changed && binary.updateAvailable,
          installed: plan.changed && !binary.error,
          repairable: Boolean(plan.changed && binary.repairable),
          modified: plan.preservedModified,
          requiresTrust: provider === "codex",
          error: plan.changed ? binary.error : null,
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
  requested: ConnectorDirectories = {},
  recoverModified = false,
) {
  const file = connectorSettingsFile(provider, directory, requested);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const release = acquireLock(dirname(file), "raypx-hooks");
  if (!release)
    throw new LocalError("INSTALLATION_BUSY", "Another Raypx hook installation is running");
  try {
    const command = connectorCommand(directory, provider),
      plan = planConnectorSettings(provider, await source(file), command, action);
    if (action === "install") installStableCli(recoverModified);
    const result = await applyHookSettings(file, plan);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const paths = savedDirectories(directory);
    paths[provider] = dirname(file);
    const temporary = join(directory, `connector-paths.${crypto.randomUUID()}.tmp`);
    writeFileSync(temporary, JSON.stringify(paths), { flag: "wx", mode: 0o600 });
    renameSync(temporary, join(directory, "connector-paths.json"));
    return {
      ...result,
      provider,
      requiresTrust: plan.requiresTrust,
      preservedModified: plan.preservedModified,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "EACCES" || error.code === "EPERM")
    )
      throw new LocalError(
        error.code,
        "Check permissions on the installation and Agent settings directories",
      );
    throw error;
  } finally {
    release();
  }
}
