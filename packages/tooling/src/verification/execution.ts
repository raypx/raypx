import { existsSync } from "node:fs";
import { join } from "node:path";
import { run } from "@raypx-kit/devkit/process";
import { checkLocales, policy } from "../policy.js";
import { runTasks } from "../repository.js";
import { smoke } from "../smoke/index.js";
import { taskRef, taskModel } from "../tasks/model.js";
import type { VerificationPlan } from "./plan.js";
import { completionReport, reportTiming } from "./report.js";

export function executionTasks(plan: VerificationPlan, rootName: string) {
  return [
    ...plan.tasks,
    ...(plan.full ? [taskRef(rootName, "knip"), taskRef(rootName, "lint")] : []),
  ];
}

async function sourceStyle(root: string, plan: VerificationPlan) {
  const findings = [...policy(root), ...checkLocales(root)];
  if (findings.length) throw new Error(findings.join("\n"));
  const files = plan.files.filter((file) => existsSync(join(root, file)));
  if (plan.full || files.length)
    await run(
      process.execPath,
      ["--bun", "vp", "fmt", "--check", ...(plan.full ? [] : files)],
      root,
    );
  if (!plan.full) {
    const lintable = files.filter((file) => /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(file));
    if (lintable.length) await run(process.execPath, ["--bun", "vp", "lint", ...lintable], root);
  }
}

export async function sourceChecks(root: string, plan: VerificationPlan) {
  const started = performance.now();
  await sourceStyle(root, plan);
  const refs = executionTasks(plan, taskModel(root).rootName);
  const checksMs = Math.round(performance.now() - started),
    taskStarted = performance.now();
  if (refs.length)
    await runTasks(root, "verify:run", [], {
      RAYPX_VERIFY_TASKS: JSON.stringify(refs),
      RAYPX_VERIFY_ROOT: root,
    });
  const tasksMs = Math.round(performance.now() - taskStarted);
  const cacheHits = refs.length ? completionReport(root, refs) : 0;
  const probeStarted = performance.now();
  if (plan.artifacts.length) await smoke(root, plan.artifacts);
  const metrics = {
    checksMs,
    tasksMs,
    artifactsMs: Math.round(performance.now() - probeStarted),
    cacheHits,
  };
  reportTiming(plan, metrics);
  return metrics;
}
