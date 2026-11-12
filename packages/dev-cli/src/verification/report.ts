import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { VerificationPlan } from "./plan.js";
import { taskRef } from "@raypx/task-graph/model";
import type { SourcePhase } from "./gates.js";

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
  const cachedTasks = summary.tasks
    .filter((entry) => "CacheHit" in entry.result)
    .map((entry) => `${entry.package_name}#${entry.task_name}`);
  return { cacheHits: cachedTasks.length, cachedTasks };
}

export function precheckTimings(root: string, rootName: string, cachedTasks: string[]) {
  const timings = { policyMs: 0, localesMs: 0 };
  const cachedChecks: string[] = [];
  for (const name of ["policy", "locales"] as const) {
    const evidence = JSON.parse(
      readFileSync(join(root, `.artifacts/verification/prechecks/${name}.json`), "utf8"),
    ) as { durationMs: number };
    if (!Number.isFinite(evidence.durationMs) || evidence.durationMs < 0)
      throw new Error(`Invalid ${name} timing evidence`);
    if (cachedTasks.includes(taskRef(rootName, name))) cachedChecks.push(name);
    else timings[`${name}Ms`] = evidence.durationMs;
  }
  return { ...timings, cachedChecks };
}

export function reportTiming(
  plan: VerificationPlan,
  metrics: {
    styleMs: number;
    policyMs: number;
    localesMs: number;
    formatMs: number;
    lintMs: number;
    cachedChecks: string[];
    tasksMs: number;
    artifactsMs: number;
    cacheHits: number;
  },
  phase?: SourcePhase,
) {
  const checks =
    phase === "tests"
      ? "Workspace test suites."
      : `Policy ${metrics.policyMs}ms; locales ${metrics.localesMs}ms; format ${metrics.formatMs}ms; lint ${metrics.lintMs}ms; cached checks: ${metrics.cachedChecks.join(", ") || "none"}. Format/lint stage ${metrics.styleMs}ms; artifacts ${metrics.artifactsMs}ms.`;
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Verification scope: ${plan.full ? "full" : "affected"}; ${plan.workspaces.length} workspaces; phase: ${phase ?? "all"}. ${checks} VP graph ${metrics.tasksMs}ms; cache hits ${metrics.cacheHits}.\n`,
    );
}
