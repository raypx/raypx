import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskRef, taskModel, taskPlan } from "@raypx/task-graph/model";
import { localPlan } from "./plan.js";
import { executionTasks, sourceChecks } from "./execution.js";
import { localTests } from "./tests.js";

export function verifyOptions(args: string[]) {
  const options: { full?: boolean; base?: string; dry?: boolean; noCache?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--full") options.full = true;
    else if (arg === "--no-cache") options.noCache = true;
    else if (arg === "--dry-run") options.dry = true;
    else if (arg === "--base" && args[i + 1] && !args[i + 1]!.startsWith("-"))
      options.base = args[++i]!;
    else throw new Error("Usage: bun verify [--full] [--no-cache] [--base ref] [--dry-run]");
  }
  return options;
}
export async function verify(root: string, args: string[]) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
    console.log(
      "bun verify          Affected types and related tests; native-input Go checks\nbun verify --full   Complete suites, current-platform checks and artifacts\nAdvanced: --base <ref>, --dry-run, --no-cache (container filesystem tracing). GUI/database/browser acceptance runs in CI.",
    );
    return;
  }
  const started = performance.now(),
    options = verifyOptions(args);
  const model = taskModel(root);
  const plan = localPlan(root, options, model);
  const tests = localTests(root, plan, model);
  if (options.dry) {
    const selected = taskModel(root, JSON.stringify(executionTasks(plan, model.rootName, tests)));
    const graph = taskPlan(selected, [taskRef(selected.rootName, "verify:run")]);
    console.log(JSON.stringify({ ...plan, tests, graph }, null, 2));
    return;
  }
  console.log(
    `Verification: ${plan.full ? "full" : "affected"}; ${plan.workspaces.length} workspaces`,
  );
  for (const reason of plan.reasons) console.log(reason);
  for (const test of tests)
    console.log(
      `${test.workspace}: ${test.mode === "related" ? `${test.files.length} related test files` : test.mode === "all" ? "complete test suite" : "no product test changes"}`,
    );
  const directory = join(root, ".artifacts/verification");
  mkdirSync(directory, { recursive: true });
  const report = (status: "running" | "passed" | "failed", details: object = {}) =>
    writeFileSync(
      join(directory, "latest.json"),
      JSON.stringify(
        {
          ...plan,
          tests,
          status,
          ...details,
          elapsedMs: Math.round(performance.now() - started),
        },
        null,
        2,
      ),
    );
  report("running");
  try {
    const metrics = await sourceChecks(root, plan, {
      tests,
      noCache: options.noCache ?? false,
      model,
    });
    report("passed", metrics);
  } catch (error) {
    report("failed");
    throw error;
  }
  console.log(`Verification passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
}
