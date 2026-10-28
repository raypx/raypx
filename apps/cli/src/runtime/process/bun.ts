import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Environment = Record<string, string | undefined>;

/** Scripts that run an executable's embedded Bun as `bun` and `bunx`. */
export function bunShims(executable: string, platform: NodeJS.Platform = process.platform) {
  if (platform === "win32") {
    // Batch files expand % and cannot quote "; setlocal keeps BUN_BE_BUN out of a calling cmd.
    if (/["%\r\n]/.test(executable)) throw new Error("Executable path cannot be quoted for cmd");
    const cmd = (args: string) =>
      `@setlocal\r\n@set BUN_BE_BUN=1\r\n@"${executable}"${args} %*\r\n`;
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
