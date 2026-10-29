import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { VerificationPlan } from "./plan.js";

/** An empty or partial VP graph must never appear as successful verification. */
export function completionReport(root: string, references: string[]) {
  const cacheRoot = join(root, "node_modules/.vite/task-cache");
  const reports = existsSync(cacheRoot)
    ? readdirSync(cacheRoot)
        .map((name) => join(cacheRoot, name, "last-summary.json"))
        .filter((file) => existsSync(file))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    : [];
  if (!reports[0]) throw new Error("VP completion report is unavailable");
  const summary = JSON.parse(readFileSync(reports[0], "utf8")) as {
    tasks: { package_name: string; task_name: string; result: Record<string, unknown> }[];
  };
  const completed = new Set(
    summary.tasks.map((entry) => `${entry.package_name}#${entry.task_name}`),
  );
  if (references.some((ref) => !completed.has(ref)))
    throw new Error("VP did not execute every selected verification task");
  return summary.tasks.filter((entry) => "CacheHit" in entry.result).length;
}

export function reportTiming(
  plan: VerificationPlan,
  metrics: {
    checksMs: number;
    tasksMs: number;
    artifactsMs: number;
    cacheHits: number;
  },
) {
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Verification scope: ${plan.full ? "full" : "affected"}; ${plan.workspaces.length} workspaces. Checks ${metrics.checksMs}ms; tasks ${metrics.tasksMs}ms; artifacts ${metrics.artifactsMs}ms; cache hits ${metrics.cacheHits}.\n`,
    );
}
