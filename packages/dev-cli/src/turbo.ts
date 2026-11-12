import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "@raypx/runtime-node/process";

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

const summaries = (root: string) => {
  const directory = join(root, ".turbo/runs");
  return existsSync(directory) ? new Set(readdirSync(directory)) : new Set<string>();
};

/** One Turbo invocation. Turbo alone schedules, hashes and restores its tasks. */
export async function turbo(
  root: string,
  tasks: string[],
  options: TurboOptions = {},
): Promise<TurboTask[]> {
  const before = summaries(root);
  await run(
    process.execPath,
    command(tasks, { ...options, options: ["--summarize", ...(options.options ?? [])] }),
    root,
    environment(options.env),
  );
  const [report] = [...summaries(root)].filter((file) => !before.has(file));
  if (!report) throw new Error("Turbo run summary is unavailable");
  const summary = JSON.parse(readFileSync(join(root, ".turbo/runs", report), "utf8")) as {
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
