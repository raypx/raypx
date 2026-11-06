import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, win32 } from "node:path";

export type Environment = Record<string, string | undefined>;

function windowsRuntime(executable: string) {
  const name = win32.basename(executable);
  if (/["\r\n]/.test(executable) || /[^\x20-\x7e]|%/.test(name))
    throw new Error("Executable path cannot be quoted for cmd");
  return {
    directory: "runtime-" + createHash("sha256").update(executable).digest("hex").slice(0, 16),
    name,
  };
}

/** Scripts that run an executable's embedded Bun as `bun` and `bunx`. */
export function bunShims(executable: string, platform: NodeJS.Platform = process.platform) {
  if (platform === "win32") {
    const runtime = windowsRuntime(executable);
    // Keep batch bytes ASCII. %~dp0 expands the Unicode profile path inside cmd;
    // the junction reaches the complete original payload without copying a binary.
    const cmd = (args: string) =>
      `@setlocal\r\n@set BUN_BE_BUN=1\r\n@"%~dp0${runtime.directory}\\${runtime.name}"${args} %*\r\n`;
    return { "bun.cmd": cmd(""), "bunx.cmd": cmd(" x") };
  }
  const quoted = `'${executable.replaceAll("'", "'\\''")}'`;
  const sh = (args: string) => `#!/bin/sh\nBUN_BE_BUN=1 exec ${quoted}${args} "$@"\n`;
  return { bun: sh(""), bunx: sh(" x") };
}

/**
 * Child processes reach this CLI's embedded Bun through shims at the end of PATH,
 * so users need not install Bun and an installed Bun keeps precedence.
 */
export class BundledBun {
  constructor(
    readonly directory: string,
    private readonly executable = process.execPath,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}
  get path() {
    return join(this.directory, this.platform === "win32" ? "bun.cmd" : "bun");
  }
  /** Rewrites changed shims; false leaves child environments unchanged. */
  ensure() {
    try {
      mkdirSync(this.directory, { recursive: true });
      if (this.platform === "win32") {
        const runtime = windowsRuntime(this.executable);
        const target = win32.dirname(this.executable);
        const link = join(this.directory, runtime.directory);
        try {
          symlinkSync(target, link, "junction");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
        if (!lstatSync(link).isSymbolicLink() || realpathSync(link) !== realpathSync(target))
          throw new Error("Bundled runtime junction has an unexpected target");
      }
      for (const [name, content] of Object.entries(bunShims(this.executable, this.platform))) {
        const file = join(this.directory, name);
        let current: string | undefined;
        try {
          current = readFileSync(file, "utf8");
        } catch {
          /* Write it below. */
        }
        if (current === content) continue;
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        writeFileSync(temporary, content, { mode: 0o755 });
        renameSync(temporary, file);
      }
      return true;
    } catch {
      return false;
    }
  }
  environment(base: Environment = process.env): Environment {
    if (!this.ensure()) return base;
    const separator = this.platform === "win32" ? ";" : ":";
    // Windows variable names are case-insensitive; keep the inherited spelling.
    const key =
      (this.platform === "win32" &&
        Object.keys(base).find((name) => name.toUpperCase() === "PATH")) ||
      "PATH";
    const current = base[key] ?? "";
    if (current.split(separator).includes(this.directory)) return base;
    return { ...base, [key]: current ? `${current}${separator}${this.directory}` : this.directory };
  }
}
