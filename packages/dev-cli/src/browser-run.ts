import { join } from "node:path";
import { run } from "@raypx/runtime-node/process";
import { browserTestArguments } from "./browser-tests.js";
import { discover } from "./repo/workspaces.js";

/** Runs the shared Playwright process from the E2E workspace. */
export async function runBrowserTests(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const workspace = discover(root, { metadataKey: "raypx" }).byName.get("@raypx/e2e");
  if (!workspace) throw new Error("Missing browser test workspace");
  await run(
    process.execPath,
    ["--bun", "playwright", "test", ...browserTestArguments(args, env)],
    join(root, workspace.path),
    env,
  );
}
