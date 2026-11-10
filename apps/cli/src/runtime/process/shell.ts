import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import type { CommandSpec } from "@raypx/jobs/model";
import { LocalError } from "../errors";
import type { Environment } from "./bun";

async function executable(path: string, platform: NodeJS.Platform) {
  try {
    await access(path, platform === "win32" ? constants.F_OK : constants.X_OK);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** The execution host selects its shell; renderer platform hints never select programs. */
export async function terminalCommand(
  input: Omit<CommandSpec, "executable"> & { executable?: string | undefined },
  environment: Environment,
  platform: NodeJS.Platform = process.platform,
  available: (path: string, platform: NodeJS.Platform) => Promise<boolean> = executable,
): Promise<CommandSpec> {
  if (input.executable !== undefined) return { ...input, executable: input.executable };
  const path = platform === "win32" ? win32 : posix;
  const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? environment.WINDIR;
  const candidates =
    platform === "win32"
      ? [
          environment.ComSpec ?? environment.COMSPEC,
          ...(systemRoot && win32.isAbsolute(systemRoot)
            ? [win32.join(systemRoot, "System32", "cmd.exe")]
            : []),
          "C:\\Windows\\System32\\cmd.exe",
        ]
      : [environment.SHELL, "/bin/sh"];
  for (const candidate of new Set(candidates)) {
    if (candidate && path.isAbsolute(candidate) && (await available(candidate, platform)))
      return { ...input, executable: candidate };
  }
  throw new LocalError("DEFAULT_SHELL_UNAVAILABLE", "No system shell is available");
}
