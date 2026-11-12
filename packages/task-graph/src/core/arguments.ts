import { createHash } from "node:crypto";
import type { TaskInvocation } from "./types.js";

export const argumentKey = (reference: string) =>
  `DEVKIT_TASK_ARGS_${createHash("sha256").update(reference.replace("#task:", "#")).digest("hex").slice(0, 20).toUpperCase()}`;
export function taskArguments(reference: string, environment: NodeJS.ProcessEnv): string[] {
  const args: unknown = JSON.parse(environment[argumentKey(reference)] ?? "[]");
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string"))
    throw new Error("Task arguments must be a string array");
  return args;
}
export function parseTaskInvocation(
  rootName: string,
  task: string,
  args: string[],
  allowFilteredArguments = false,
): TaskInvocation {
  const separator = task.lastIndexOf("#");
  const split = args.indexOf("--");
  const flags = split < 0 ? args : args.slice(0, split);
  const forwarded = split < 0 ? [] : args.slice(split + 1);
  const filtered = flags.some((arg) => arg === "--filter" || arg.startsWith("--filter="));
  const dry = flags.includes("--dry-run") || flags.includes("--dry=json");
  if (separator >= 0 && filtered)
    throw new Error("Use either a qualified task or workspace filters");
  if (filtered && forwarded.length && !allowFilteredArguments)
    throw new Error("Use package#task when forwarding arguments to one filtered workspace");
  if (filtered && dry) throw new Error("Use package#task to inspect a filtered task plan");
  return {
    owner: separator < 0 ? rootName : task.slice(0, separator),
    name: separator < 0 ? task : task.slice(separator + 1),
    filtered,
    forwarded,
    dry,
    options: flags
      .filter((arg) => !["--dry-run", "--dry=json"].includes(arg))
      .map((arg) =>
        arg === "--summarize"
          ? "--verbose"
          : arg === "--concurrency"
            ? "--concurrency-limit"
            : arg.replace(/^--concurrency=/, "--concurrency-limit="),
      ),
  };
}
export function taskScripts(
  scripts: Record<string, string>,
  delegates: Record<string, string> = {},
) {
  for (const [name, target] of Object.entries(delegates)) {
    if (!scripts[name] || typeof target !== "string" || !scripts[target])
      throw new Error(`Task delegation needs existing scripts: ${name}`);
    if (Object.hasOwn(delegates, target))
      throw new Error(`Task delegation must end in a runner script: ${name}`);
  }
  return delegates;
}
