import { existsSync } from "node:fs";
import { join } from "node:path";
import { run } from "@raypx/runtime-node/process";
import { runTasks } from "../repository.ts";
import { smoke } from "../smoke/index.ts";
import { taskRef, taskModel, taskPlan } from "../tasks/model.ts";
import { argumentKey } from "../tasks/arguments.ts";
import type { VerificationPlan } from "./plan.ts";
import type { TestSelection } from "./tests.ts";
import { completionReport, precheckTimings, reportTiming } from "./report.ts";
import { reportBuildSizes } from "../validation/build-size.ts";

export function executionTasks(
  plan: VerificationPlan,
  rootName: string,
  tests: TestSelection[] = [],
) {
  return [
    taskRef(rootName, "policy"),
    taskRef(rootName, "locales"),
    ...plan.tasks.filter(
      (task) => !tests.some((test) => test.task === task && test.mode === "none"),
    ),
    ...(plan.full ? [taskRef(rootName, "knip")] : []),
  ];
}

async function sourceStyle(root: string, plan: VerificationPlan) {
  const timings = { formatMs: 0, lintMs: 0 };
  const files = plan.files.filter((file) => existsSync(join(root, file)));
  const formatStarted = performance.now();
  if (plan.full || files.length)
    await run(
      "pnpm",
      [
        "exec",
        "vp",
        "fmt",
        "--check",
        "--no-error-on-unmatched-pattern",
        ...(plan.full ? [] : files),
      ],
      root,
    );
  timings.formatMs = Math.round(performance.now() - formatStarted);
  const lintStarted = performance.now();
  const lintable = files.filter((file) => /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(file));
  if (plan.full || lintable.length)
    await run("pnpm", ["exec", "vp", "lint", ...(plan.full ? [] : lintable)], root);
  timings.lintMs = Math.round(performance.now() - lintStarted);
  return timings;
}

export async function sourceChecks(
  root: string,
  plan: VerificationPlan,
  tests: TestSelection[] = [],
) {
  const started = performance.now();
  const style = await sourceStyle(root, plan);
  const model = taskModel(root);
  const rootName = model.rootName;
  const refs = executionTasks(plan, rootName, tests);
  const styleMs = Math.round(performance.now() - started),
    taskStarted = performance.now();
  if (refs.length)
    await runTasks(root, "verify:run", [], {
      RAYPX_VERIFY_TASKS: JSON.stringify(refs),
      RAYPX_VERIFY_ROOT: root,
      ...Object.fromEntries(
        tests.map((test) => [
          argumentKey(test.task),
          JSON.stringify(test.mode === "related" ? test.files : []),
        ]),
      ),
    });
  const tasksMs = Math.round(performance.now() - taskStarted);
  const { cacheHits, cachedTasks } = completionReport(root, refs);
  const prechecks = precheckTimings(root, rootName, cachedTasks);
  const probeStarted = performance.now();
  const builds = taskPlan(model, refs)
    .filter((task) => task.taskId.endsWith("#build"))
    .map((task) => task.taskId.slice(0, -"#build".length));
  if (builds.length) reportBuildSizes(root, { packages: builds, required: true });
  if (plan.artifacts.length) await smoke(root, plan.artifacts);
  const metrics = {
    ...prechecks,
    ...style,
    styleMs,
    tasksMs,
    artifactsMs: Math.round(performance.now() - probeStarted),
    cacheHits,
  };
  console.log(
    `Checks: policy ${metrics.policyMs}ms; locales ${metrics.localesMs}ms; format ${metrics.formatMs}ms; lint ${metrics.lintMs}ms; cached: ${metrics.cachedChecks.join(", ") || "none"}`,
  );
  reportTiming(plan, metrics);
  return metrics;
}
