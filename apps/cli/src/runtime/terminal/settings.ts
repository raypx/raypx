import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { TERMINAL_HOOK_TIMEOUT_SECONDS } from "@raypx/contracts/terminal";
import type { AgentProvider } from "@raypx/contracts/tasks";
import { LocalError } from "../errors";

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value: string | null) =>
  createHash("sha256")
    .update(value ?? "<missing>")
    .digest("hex");
export type HookSettingsPlan = {
  provider: AgentProvider;
  before: string | null;
  beforeHash: string;
  after: string;
  changed: boolean;
  requiresTrust: boolean;
  preservedModified: boolean;
};

/** Strict JSON only: JSONC/TOML require an explicit reviewed increment, never a lossy rewrite. */
export function planHookSettings(
  provider: AgentProvider,
  source: string | null,
  command: string,
  action: "install" | "uninstall",
): HookSettingsPlan {
  if (!command.trim() || command.length > 8192 || /[\r\n\0]/.test(command))
    throw new LocalError("INVALID_HOOK_COMMAND", "Hook command must be one bounded line");
  if (source !== null && Buffer.byteLength(source) > 1024 * 1024)
    throw new LocalError("TOO_LARGE", "Agent settings exceed 1 MiB");
  let settings: unknown;
  try {
    settings = source === null ? {} : JSON.parse(source);
  } catch {
    throw new LocalError(
      "UNSUPPORTED_SETTINGS_FORMAT",
      "Agent settings are not strict JSON; use a reviewed manual increment",
    );
  }
  if (!object(settings) || (settings.hooks !== undefined && !object(settings.hooks)))
    throw new LocalError("INVALID_HOOK_SETTINGS", "Agent hooks must be an object");
  const hooks: Record<string, unknown> = {
    ...settings.hooks,
  };
  const event = "PermissionRequest";
  const previous = hooks[event] ?? [];
  if (!Array.isArray(previous))
    throw new LocalError("INVALID_HOOK_SETTINGS", "PermissionRequest matchers must be an array");
  // Broaden only when a real recorded contract enables the additional tool.
  const matcher = "Bash";
  const handler = { type: "command", command, timeout: TERMINAL_HOOK_TIMEOUT_SECONDS };
  const sameHandler = (value: Record<string, unknown>) =>
    Object.keys(value).length === 3 &&
    value.type === handler.type &&
    value.command === handler.command &&
    value.timeout === handler.timeout;
  let found = false,
    preservedModified = false;
  const groups: unknown[] = [];
  for (const value of previous) {
    if (!object(value) || !Array.isArray(value.hooks))
      throw new LocalError("INVALID_HOOK_SETTINGS", "Hook matcher has no handlers array");
    const remaining: unknown[] = [];
    for (const hook of value.hooks) {
      if (!object(hook) || hook.command !== command) {
        remaining.push(hook);
        continue;
      }
      const owned =
        value.matcher === matcher && Object.keys(value).length === 2 && sameHandler(hook);
      if (!owned) {
        preservedModified = true;
        if (action === "install")
          throw new LocalError(
            "HOOK_MODIFIED",
            "Existing Raypx hook was edited; review it before reinstalling",
          );
        remaining.push(hook);
      } else {
        found = true;
        if (action === "install") remaining.push(hook);
      }
    }
    if (remaining.length || !value.hooks.length) groups.push({ ...value, hooks: remaining });
  }
  if (action === "install" && !found) groups.push({ matcher, hooks: [handler] });
  if (groups.length) hooks[event] = groups;
  else delete hooks[event];
  const next: Record<string, unknown> = { ...settings };
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  const changed = action === "install" ? !found : found;
  const indent = source?.match(/(?:^|\r?\n)([\t ]+)"/)?.[1] ?? 2;
  const eol = source?.includes("\r\n") ? "\r\n" : "\n";
  const after = JSON.stringify(next, null, indent).replaceAll("\n", eol) + eol;
  return {
    provider,
    before: source,
    beforeHash: hash(source),
    after: changed ? after : (source ?? "{}\n"),
    changed,
    requiresTrust: provider === "codex",
    preservedModified,
  };
}

export async function readHookSettings(
  file: string,
): Promise<{ text: string; mode: number } | null> {
  try {
    const stat = await lstat(file);
    if (stat.isSymbolicLink())
      throw new LocalError(
        "HOOK_SETTINGS_SYMLINK",
        "Agent settings are a symbolic link. Add the reviewed Raypx hook to the dotfiles target manually; Raypx will not replace the link.",
      );
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new LocalError(
        "INVALID_HOOK_SETTINGS",
        "Agent settings must be a regular file of at most 1 MiB",
      );
    return { text: await readFile(file, "utf8"), mode: stat.mode & 0o777 };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}

export async function applyHookSettings(file: string, plan: HookSettingsPlan) {
  if (!isAbsolute(file))
    throw new LocalError("INVALID_SETTINGS_PATH", "Agent settings path must be absolute");
  const original = await readHookSettings(file);
  if (hash(original?.text ?? null) !== plan.beforeHash)
    throw new LocalError("SETTINGS_CONFLICT", "Agent settings changed after the plan was created");
  if (!plan.changed) return { changed: false, backup: null };
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const suffix = crypto.randomUUID(),
    temporary = `${file}.raypx-${suffix}.tmp`;
  const backup = plan.before === null ? null : `${file}.raypx-backup-${suffix}`;
  try {
    if (backup) await writeFile(backup, plan.before!, { flag: "wx", mode: 0o600 });
    await writeFile(temporary, plan.after, { flag: "wx", mode: 0o600 });
    await chmod(temporary, original?.mode ?? 0o600);
    const current = await readHookSettings(file);
    if (hash(current?.text ?? null) !== plan.beforeHash || current?.mode !== original?.mode)
      throw new LocalError("SETTINGS_CONFLICT", "Agent settings changed before replacement");
    await rename(temporary, file);
    return { changed: true, backup };
  } finally {
    await rm(temporary, { force: true });
  }
}
