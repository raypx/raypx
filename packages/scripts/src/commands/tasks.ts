import { execFileSync } from "node:child_process";

import { runCliAction } from "../runtime/action.js";
import { repositoryRoot } from "../runtime/repository.js";
import { runCommand } from "../runtime/process.js";

const remoteKeys = ["TURBO_TOKEN", "TURBO_TEAM", "TURBO_REMOTE_CACHE_SIGNATURE_KEY"] as const;

/** Partition native artifacts by the actual executable runtime and libc. */
export function cachePlatform(): string {
  const runtime = execFileSync(
    "node",
    [
      "--input-type=module",
      "--eval",
      'console.log([process.platform,process.arch,process.version,process.report.getReport().header.glibcVersionRuntime??(process.platform==="linux"?"musl":"native")].join(":"))',
    ],
    { encoding: "utf8" },
  ).trim();
  return `${runtime}:bun-${execFileSync("bun", ["--version"], { encoding: "utf8" }).trim()}`;
}

export function taskInvocation(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  platform: string,
) {
  const env: NodeJS.ProcessEnv = { ...environment, VMX_CACHE_PLATFORM: platform };
  const trusted = !env.CI || env.VMX_REMOTE_CACHE_TRUSTED === "true";
  const remote = trusted && remoteKeys.every((key) => !!env[key]);
  if (!remote) for (const key of [...remoteKeys, "TURBO_API"]) delete env[key];
  // Prevent callers from accidentally bypassing the cache trust boundary.
  if (args.some((arg) => /^--(?:cache|env-mode)(?:=|$)/.test(arg)))
    throw new Error("Cache and environment policy belong to vmx tasks, not caller flags.");
  return {
    command: [
      "turbo",
      "run",
      "--env-mode=strict",
      `--cache=local:rw${remote ? ",remote:rw" : ""}`,
      ...args,
    ],
    env,
  };
}

export async function runTasks(args: readonly string[]): Promise<void> {
  await runCliAction(
    "tasks",
    async () => {
      const invocation = taskInvocation(args, process.env, cachePlatform());
      await runCommand(invocation.command, { cwd: repositoryRoot, env: invocation.env });
    },
    { plainErrors: true },
  );
}
