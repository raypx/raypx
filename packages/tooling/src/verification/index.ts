import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTasks } from "../repository.js";
import { taskRef, taskModel, taskPlan } from "../tasks/model.js";
import { localPlan, readGithubPlan } from "./plan.js";
import { executionTasks, sourceChecks } from "./execution.js";

export function verifyOptions(args: string[]) {
  const options: { full?: boolean; base?: string; dry?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--full") options.full = true;
    else if (arg === "--dry-run") options.dry = true;
    else if (arg === "--base" && args[i + 1] && !args[i + 1]!.startsWith("-"))
      options.base = args[++i]!;
    else throw new Error("Usage: bun run verify [--full] [--base ref] [--dry-run]");
  }
  return options;
}
export async function verify(root: string, args: string[]) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
    console.log(
      "bun run verify              Affected JS/Go/Rust source checks\nbun run verify --full       Full current-platform checks and artifacts\nAdvanced: --base <ref>, --dry-run. GUI/database/browser acceptance runs in CI.",
    );
    return;
  }
  const started = performance.now(),
    options = verifyOptions(args);
  const plan = localPlan(root, options);
  if (options.dry) {
    const model = taskModel(
      root,
      JSON.stringify(executionTasks(plan, taskModel(root).rootName)),
      JSON.stringify(plan.rustPackages),
    );
    const graph = taskPlan(model, [taskRef(model.rootName, "verify:run")]);
    console.log(JSON.stringify({ ...plan, graph }, null, 2));
    return;
  }
  console.log(
    `Verification: ${plan.full ? "full" : "affected"}; ${plan.workspaces.length} workspaces; Rust ${plan.rust ? "enabled" : "not needed"}`,
  );
  for (const reason of plan.reasons) console.log(reason);
  const metrics = await sourceChecks(root, plan);
  const directory = join(root, ".artifacts/verification");
  mkdirSync(directory, { recursive: true });
  const report = { ...plan, ...metrics, elapsedMs: Math.round(performance.now() - started) };
  writeFileSync(join(directory, "latest.json"), JSON.stringify(report, null, 2));
  console.log(`Verification passed in ${(report.elapsedMs / 1000).toFixed(1)}s`);
}
/** Internal CI gate; user-facing verification remains one command. */
export async function ciGate(root: string, args: string[]) {
  const plan = readGithubPlan(root),
    [gate] = args;
  if (gate === "js") {
    await sourceChecks(root, { ...plan, rust: false });
  } else if (gate === "backend") {
    if (plan.backend)
      for (const name of ["test:postgres", "test:redis"]) await runTasks(root, `api#${name}`);
  } else if (gate === "browser") {
    if (plan.browser !== "none")
      await runTasks(root, `@raypx/e2e#${plan.browser === "all" ? "e2e" : `e2e:${plan.browser}`}`);
  } else throw new Error("Unknown internal CI gate");
}
