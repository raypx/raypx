import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/**
 * Copies the current environment and layers local dotenv files beneath it; values
 * already set in the process win, then earlier files. Values are taken literally
 * (no `${VAR}` expansion or command substitution) and never printed.
 */
export function developmentEnvironment(
  root: string,
  files: readonly string[] = [".env.local", ".env"],
): NodeJS.ProcessEnv {
  // Copy rather than filter: consumers may augment ProcessEnv with required keys.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8"))))
      if (value !== undefined) env[key] ??= value;
  }
  return env;
}

/** Runs a command with inherited output, forwarding interrupts and rejecting on failure. */
export function run(
  command: string,
  args: string[],
  cwd: string,
  env = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", windowsHide: true });
    const forward = (signal: NodeJS.Signals) => {
      child.kill(signal);
    };
    const interrupt = () => forward("SIGINT");
    const terminate = () => forward("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code ?? signal}`));
    });
  });
}
