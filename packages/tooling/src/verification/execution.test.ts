import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { project } from "../../tests/helpers/verification";
import * as processes from "@raypx/runtime-node/process";
import * as repository from "../repository";
import * as artifacts from "../smoke";
import { sourceChecks } from "./execution";
import { verificationPlan } from "./plan";

afterEach(() => vi.restoreAllMocks());

it("runs the test phase without style commands, precheck evidence or prepared artifacts", async () => {
  const { root, model } = project();
  const plan = verificationPlan(model, [], { full: true });
  const style = vi.spyOn(processes, "run").mockRejectedValue(new Error("Unexpected style command"));
  const smoke = vi
    .spyOn(artifacts, "smoke")
    .mockRejectedValue(new Error("Unexpected artifact probe"));
  const tasks = vi.spyOn(repository, "runTasks").mockImplementation(async (_, task, args, env) => {
    expect(task).toBe("verify:run");
    expect(args).toEqual([]);
    const refs = JSON.parse(env!.RAYPX_VERIFY_TASKS!) as string[];
    expect(refs.sort()).toEqual([
      "@raypx/independent#task:test",
      "@raypx/tokens#task:test",
      "api#task:test",
    ]);
    const directory = join(root, "node_modules/.vite/task-cache/fixture");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "last-summary.json"),
      JSON.stringify({
        tasks: refs.map((ref) => {
          const [package_name, task_name] = ref.split("#");
          return { package_name, task_name, result: { Success: {} } };
        }),
      }),
    );
  });
  const metrics = await sourceChecks(root, plan, { phase: "tests" });
  expect(tasks).toHaveBeenCalledOnce();
  expect(style).not.toHaveBeenCalled();
  expect(smoke).not.toHaveBeenCalled();
  expect(metrics.cachedChecks).toEqual([]);
});
