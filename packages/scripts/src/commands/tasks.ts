import { execFileSync } from "node:child_process";

import { runCliAction } from "../runtime/action.js";
import { repositoryRoot } from "../runtime/repository.js";
import { runCommand } from "../runtime/process.js";

const remoteKeys = ["TURBO_TOKEN", "TURBO_TEAM", "TURBO_REMOTE_CACHE_SIGNATURE_KEY"] as const;

/** Partition native artifacts by the actual Bun runtime, revision, OS, architecture and libc. */
export function cachePlatform(): string {
  return execFileSync(
    "bun",
    [
      "--eval",
      [
        'let libc = "native";',
        'if (process.platform === "linux") {',
        "  const version = process.report?.getReport?.()?.header?.glibcVersionRuntime;",
        '  if (version) libc = "glibc-" + version;',
        "  else {",
        '    const result = Bun.spawnSync(["ldd", "--version"]);',
        "    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);",
        '    if (/musl/i.test(output)) libc = "musl";',
        "    else if (/glibc|GNU libc|GNU C Library/i.test(output)) {",
        "      const release = output.match(/\\d+\\.\\d+/)?.[0];",
        '      if (!release) throw new Error("Cannot determine the glibc version for the Bun artifact cache.");',
        '      libc = "glibc-" + release;',
        "    }",
        '    else throw new Error("Cannot determine Linux libc for the Bun artifact cache.");',
        "  }",
        "}",
        'console.log([process.platform, process.arch, "bun-" + Bun.version, Bun.revision, libc].join(":"));',
      ].join("\n"),
    ],
    { encoding: "utf8" },
  ).trim();
}

export function taskInvocation(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  platform: string,
) {
  const env: NodeJS.ProcessEnv = { ...environment, RPX_CACHE_PLATFORM: platform };
  const trusted = !env.CI || env.RPX_REMOTE_CACHE_TRUSTED === "true";
  const remote = trusted && remoteKeys.every((key) => !!env[key]);
  if (!remote) for (const key of [...remoteKeys, "TURBO_API"]) delete env[key];
  // Prevent callers from accidentally bypassing the cache trust boundary.
  if (args.some((arg) => /^--(?:cache|env-mode)(?:=|$)/.test(arg)))
    throw new Error("Cache and environment policy belong to rpx tasks, not caller flags.");
  return {
    command: [
      "bun",
      "--bun",
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
