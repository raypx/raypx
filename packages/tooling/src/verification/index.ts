import { smokeDeployment } from "../validation/deployment-smoke.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTasks } from "../repository.ts";
import { taskRef, taskModel, taskPlan } from "../tasks/model.ts";
import { localPlan } from "./plan.ts";
import { executionTasks, sourceChecks } from "./execution.ts";
import { ciOutputs, parseCiPlan, requiredGates } from "./gates.ts";
import { localTests } from "./tests.ts";

export function verifyOptions(args: string[]) {
  const options: { full?: boolean; base?: string; dry?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--full") options.full = true;
    else if (arg === "--dry-run") options.dry = true;
    else if (arg === "--base" && args[i + 1] && !args[i + 1]!.startsWith("-"))
      options.base = args[++i]!;
    else throw new Error("Usage: pnpm run verify [--full] [--base ref] [--dry-run]");
  }
  return options;
}
export async function verify(root: string, args: string[]) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
    console.log(
      "pnpm run verify              Affected types and related tests; native-input Rust checks\npnpm run verify --full       Complete suites, current-platform checks and artifacts\nAdvanced: --base <ref>, --dry-run. GUI/database/browser acceptance runs in CI.",
    );
    return;
  }
  const started = performance.now(),
    options = verifyOptions(args);
  const plan = localPlan(root, options);
  const tests = localTests(root, plan);
  if (options.dry) {
    const model = taskModel(
      root,
      JSON.stringify(executionTasks(plan, taskModel(root).rootName, tests)),
    );
    const graph = taskPlan(model, [taskRef(model.rootName, "verify:run")]);
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
    const metrics = await sourceChecks(root, plan, tests);
    report("passed", metrics);
  } catch (error) {
    report("failed");
    throw error;
  }
  console.log(`Verification passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
}
/** Internal CI gate; user-facing verification remains one command. */
export async function ciGate(root: string, args: string[]) {
  const plan = parseCiPlan(process.env.RAYPX_CI_PLAN ?? "{}", process.env.GITHUB_SHA ?? ""),
    [gate] = args;
  const name = gate === "js" ? "javascript" : gate;
  const decision = requiredGates(ciOutputs(plan, process.env.GITHUB_SHA ?? "")).find(
    (entry) => entry.name === name,
  );
  if (args.length !== 1 || !decision || decision.name === "desktop")
    throw new Error("Unknown internal CI gate");
  if (!decision.required) throw new Error(`CI gate ${name} was not selected by change analysis`);
  if (gate === "js") {
    await sourceChecks(root, plan);
  } else if (gate === "deployment") {
    await smokeDeployment(root, []);
  } else if (gate === "backend") {
    for (const task of ["test:postgres", "test:redis", "test:cluster"])
      await runTasks(root, `api#${task}`);
  } else if (gate === "browser") {
    await runTasks(root, `@raypx/e2e#${plan.browser === "all" ? "e2e" : `e2e:${plan.browser}`}`);
  } else throw new Error("Unknown internal CI gate");
}
