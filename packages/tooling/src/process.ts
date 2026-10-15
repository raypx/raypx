import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "@dotenvx/dotenvx";
import { readToolchain } from "./toolchain.js";

export function developmentEnvironment(root: string): NodeJS.ProcessEnv {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (existsSync(path)) config({ path, processEnv: env, quiet: true });
  }
  return env;
}

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

export function turbo(root: string, task: string, args: string[] = []): Promise<void> {
  const env =
    task === "dev" || task === "build" ? developmentEnvironment(root) : { ...process.env };
  env.RAYPX_CACHE_PLATFORM = `${process.platform}-${process.arch}-bun${Bun.version}-node${readToolchain(root).node}`;
  // Remote credentials are usable only in the protected workflow; forks cannot read them.
  if (env.RAYPX_REMOTE_CACHE_TRUSTED !== "true") {
    for (const key of ["TURBO_TOKEN", "TURBO_TEAM", "TURBO_REMOTE_CACHE_SIGNATURE_KEY"])
      delete env[key];
    delete env.TURBO_REMOTE_ONLY;
    args = ["--cache=local:rw", ...args];
  }
  return run(process.execPath, ["--bun", "turbo", "run", task, ...args], root, env);
}
