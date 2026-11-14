import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { once } from "node:events";
import { stripVTControlCharacters } from "node:util";
import { spawnProcess } from "@raypx/runtime-node/process";

export interface TurboTask {
  taskId: string;
  cached: boolean;
  durationMs: number;
}
export interface TurboPlanTask {
  taskId: string;
  command: string;
  dependencies: string[];
  cacheable: boolean;
}
export interface TurboOptions {
  /** Turbo flags placed before `--`. */
  options?: string[];
  /** Arguments every selected task's script receives; they join its cache key. */
  forwarded?: string[];
  env?: NodeJS.ProcessEnv;
}

/** Heavy suites time out when the default ten tasks share a developer machine. */
const defaultConcurrency = "3";

/** Operating system, architecture and Bun version separate otherwise equal cache keys. */
export const cachePlatform = () => `${process.platform}-${process.arch}-bun${process.versions.bun}`;

function environment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    RAYPX_CACHE_PLATFORM: cachePlatform(),
    TURBO_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: env.DO_NOT_TRACK ?? "1",
  };
}

function command(tasks: string[], { options = [], forwarded = [] }: TurboOptions) {
  if (!tasks.length) throw new Error("Turbo needs at least one task");
  const concurrency = options.some((option) => option.startsWith("--concurrency"))
    ? []
    : [`--concurrency=${process.env.RAYPX_TASK_CONCURRENCY ?? defaultConcurrency}`];
  return [
    "--bun",
    "turbo",
    "run",
    ...tasks,
    ...concurrency,
    ...options,
    ...(forwarded.length ? ["--", ...forwarded] : []),
  ];
}

async function runSummary(root: string, tasks: string[], options: TurboOptions) {
  const child = spawnProcess(
    [
      process.execPath,
      ...command(tasks, { ...options, options: ["--summarize", ...(options.options ?? [])] }),
    ],
    {
      cwd: root,
      env: environment(options.env),
      stdin: "inherit",
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  let report: string | undefined;
  const output = (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    function line(value: string) {
      let text = stripVTControlCharacters(value);
      if (options.options?.includes("--json")) {
        try {
          const event = JSON.parse(text) as { source?: unknown; text?: unknown };
          if (event.source !== "turbo" || typeof event.text !== "string") return;
          text = event.text;
        } catch {
          return;
        }
      }
      const match = /^Summary:\s+(.+\.json)\s*$/.exec(text);
      if (match) report = resolve(root, match[1]!);
    }
    for await (const chunk of child.stdout) {
      if (!process.stdout.write(chunk)) await once(process.stdout, "drain");
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const value of lines) line(value);
    }
    line(pending + decoder.decode());
  })();
  try {
    const [code] = await Promise.all([child.exited, output]);
    if (code !== 0) throw new Error(`${process.execPath} exited ${code}`);
    if (!report || dirname(report) !== resolve(root, ".turbo/runs"))
      throw new Error("Turbo run summary is unavailable");
    return report;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

/** One Turbo invocation. Turbo alone schedules, hashes and restores its tasks. */
export async function turbo(
  root: string,
  tasks: string[],
  options: TurboOptions = {},
): Promise<TurboTask[]> {
  const report = await runSummary(root, tasks, options);
  const summary = JSON.parse(readFileSync(report, "utf8")) as {
    tasks: {
      taskId: string;
      command: string;
      cache: { status: string };
      execution?: { startTime: number; endTime: number };
    }[];
  };
  return summary.tasks
    .filter((task) => task.command !== "<NONEXISTENT>")
    .map((task) => ({
      taskId: task.taskId,
      cached: task.cache.status === "HIT",
      durationMs: task.execution ? task.execution.endTime - task.execution.startTime : 0,
    }));
}

/** The tasks an invocation would run, dependencies included, without executing them. */
export function turboPlan(
  root: string,
  tasks: string[],
  options: TurboOptions = {},
): TurboPlanTask[] {
  const result = Bun.spawnSync(
    [
      process.execPath,
      ...command(tasks, { ...options, options: [...(options.options ?? []), "--dry=json"] }),
    ],
    { cwd: root, env: environment(options.env), stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
  const plan = JSON.parse(result.stdout.toString()) as {
    tasks: (TurboPlanTask & { resolvedTaskDefinition: { cache: boolean } })[];
  };
  return plan.tasks
    .filter((task) => task.command !== "<NONEXISTENT>")
    .map(({ taskId, command: script, dependencies, resolvedTaskDefinition }) => ({
      taskId,
      command: script,
      dependencies: dependencies.filter((dependency) => !dependency.endsWith("#transit")),
      cacheable: resolvedTaskDefinition.cache,
    }));
}
