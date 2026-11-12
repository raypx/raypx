import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { VerificationPlan } from "./plan.js";
import { taskRef } from "@raypx/task-graph/model";
import { sourcePhases, type CiPlan, type SourcePhase } from "./gates.js";

export function reportCiPlan(plan: CiPlan) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const safe = (text: string) =>
    text
      .replace(/[\r\n]+/g, " ")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const lines = [
    "## Verification plan",
    "",
    `- Baseline SHA ${plan.baseline ? `\`${plan.baseline}\`` : "unavailable"}`,
    `- ${plan.full ? "Full" : "Affected"} source verification · ${plan.workspaces.length} workspaces`,
    ...plan.reasons.slice(0, 10).map((reason) => `  - <code>${safe(reason)}</code>`),
    `- Source tests · ${sourcePhases(plan).includes("tests") ? "selected" : "skipped"}`,
  ];
  for (const [surface, selection] of Object.entries(plan.browser)) {
    lines.push(
      `- ${surface === "web" ? "Web" : "Desktop"} browser · ${selection.mode === "none" ? "skipped" : selection.mode}`,
    );
    for (const reason of selection.reasons) lines.push(`  - <code>${safe(reason)}</code>`);
  }
  lines.push(
    `- Native checks · ${plan.nativeRunners.join(", ") || "skipped"}`,
    `- Native distribution · ${plan.distribution ? "selected" : "skipped"}`,
    `- Backend integration · ${plan.backend ? "selected" : "skipped"}`,
    `- Container smoke · ${plan.containerSmoke ? "selected" : "skipped"}`,
  );
  appendFileSync(summary, `${lines.join("\n")}\n`);
}

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
