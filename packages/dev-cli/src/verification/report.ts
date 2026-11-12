import { appendFileSync } from "node:fs";
import type { VerificationPlan } from "./plan.js";
import { taskRef } from "../workspace-graph.js";
import type { TurboTask } from "../turbo.js";
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

/** An empty or partial Turbo run must never appear as successful verification. */
export function completionReport(results: TurboTask[], references: string[]) {
  const completed = new Set(results.map((task) => task.taskId));
  if (references.some((ref) => !completed.has(ref)))
    throw new Error("Turbo did not execute every selected verification task");
  const cachedTasks = results.filter((task) => task.cached).map((task) => task.taskId);
  return { cacheHits: cachedTasks.length, cachedTasks };
}

/** A restored check reports no time; an executed one reports Turbo's measured duration. */
export function precheckTimings(results: TurboTask[], rootName: string) {
  const timings = { policyMs: 0, localesMs: 0 };
  const cachedChecks: string[] = [];
  for (const name of ["policy", "locales"] as const) {
    const task = results.find((result) => result.taskId === taskRef(rootName, name));
    if (!task) throw new Error(`Missing ${name} verification result`);
    if (task.cached) cachedChecks.push(name);
    else timings[`${name}Ms`] = task.durationMs;
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
      `Verification scope: ${plan.full ? "full" : "affected"}; ${plan.workspaces.length} workspaces; phase: ${phase ?? "all"}. ${checks} Turbo ${metrics.tasksMs}ms; cache hits ${metrics.cacheHits}.\n`,
    );
}
