import { existsSync } from "node:fs";
import { join } from "node:path";
import { run } from "@raypx/runtime-node/process";
import { runTasks } from "../repository.js";
import { taskRef, taskModel, taskPlan } from "@raypx/tooling/tasks/model";
import { argumentKey } from "@raypx/devkit/tasks";
import type { VerificationPlan } from "./plan.js";
import type { TestSelection } from "./tests.js";
import { completionReport, precheckTimings, reportTiming } from "./report.js";
import { reportBuildSizes } from "../validation/build-size.js";
import { sourceTasks, type SourcePhase } from "./gates.js";

export function executionTasks(
  plan: VerificationPlan,
  rootName: string,
  tests: TestSelection[] = [],
  phase?: SourcePhase,
) {
  const tasks = phase ? sourceTasks(plan, phase) : plan.tasks;
  return [
    ...(phase === "tests" ? [] : [taskRef(rootName, "policy"), taskRef(rootName, "locales")]),
    ...tasks.filter((task) => !tests.some((test) => test.task === task && test.mode === "none")),
    ...(plan.full && phase !== "tests" ? [taskRef(rootName, "knip")] : []),
  ];
}

async function sourceStyle(root: string, plan: VerificationPlan) {
  const timings = { formatMs: 0, lintMs: 0 };
  const files = plan.files.filter((file) => existsSync(join(root, file)));
  const formatStarted = performance.now();
  if (plan.full || files.length)
    await run(
      process.execPath,
      [
        "--bun",
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
    await run(process.execPath, ["--bun", "vp", "lint", ...(plan.full ? [] : lintable)], root);
  timings.lintMs = Math.round(performance.now() - lintStarted);
  return timings;
}

export async function sourceChecks(
  root: string,
  plan: VerificationPlan,
  options: { tests?: TestSelection[]; noCache?: boolean; phase?: SourcePhase } = {},
) {
  const { tests = [], noCache = false, phase } = options;
  const started = performance.now();
  const style = phase === "tests" ? { formatMs: 0, lintMs: 0 } : await sourceStyle(root, plan);
  const model = taskModel(root);
  const rootName = model.rootName;
  const refs = executionTasks(plan, rootName, tests, phase);
  const styleMs = Math.round(performance.now() - started),
    taskStarted = performance.now();
  if (refs.length)
    await runTasks(root, "verify:run", noCache ? ["--no-cache"] : [], {
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
  const prechecks =
    phase === "tests"
      ? { policyMs: 0, localesMs: 0, cachedChecks: [] }
      : precheckTimings(root, rootName, cachedTasks);
  const probeStarted = performance.now();
  const builds = taskPlan(model, refs)
    .filter((task) => task.taskId.endsWith("#build"))
    .map((task) => task.taskId.slice(0, -"#build".length));
  if (builds.length) reportBuildSizes(root, { packages: builds, required: true });
  if (phase !== "tests" && plan.artifacts.length) {
    const { smoke } = await import("../smoke/index.js");
    await smoke(root, plan.artifacts);
  }
  const metrics = {
    ...prechecks,
    ...style,
    styleMs,
    tasksMs,
    artifactsMs: Math.round(performance.now() - probeStarted),
    cacheHits,
  };
  if (phase !== "tests")
    console.log(
      `Checks: policy ${metrics.policyMs}ms; locales ${metrics.localesMs}ms; format ${metrics.formatMs}ms; lint ${metrics.lintMs}ms; cached: ${metrics.cachedChecks.join(", ") || "none"}`,
    );
  reportTiming(plan, metrics, phase);
  return metrics;
}
