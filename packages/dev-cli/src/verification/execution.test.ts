import { afterEach, expect, it, vi } from "vitest";
import { project } from "../../tests/helpers/verification.js";
import * as processes from "@raypx/runtime-node/process";
import * as repository from "../repository.js";
import * as runner from "../turbo.js";
import * as artifacts from "../smoke/index.js";
import { executionTasks, sourceChecks } from "./execution.js";
import { verificationPlan } from "./plan.js";

afterEach(() => vi.restoreAllMocks());

it("runs the test phase without style commands, precheck evidence or prepared artifacts", async () => {
  const { root, model } = project();
  const plan = verificationPlan(model, [], { full: true });
  const style = vi.spyOn(processes, "run").mockRejectedValue(new Error("Unexpected style command"));
  const smoke = vi
    .spyOn(artifacts, "smoke")
    .mockRejectedValue(new Error("Unexpected artifact probe"));
  vi.spyOn(repository, "taskEnvironment").mockReturnValue({ VITE_APP_RELEASE: "test" });
  const tasks = vi.spyOn(runner, "turbo").mockImplementation(async (_, refs, options) => {
    expect(options?.options).toEqual([]);
    expect([...refs].sort()).toEqual(["@raypx/independent#test", "@raypx/tokens#test", "api#test"]);
    return refs.map((taskId) => ({ taskId, cached: false, durationMs: 1 }));
  });
  const metrics = await sourceChecks(root, plan, { phase: "tests" });
  expect(tasks).toHaveBeenCalledOnce();
  expect(style).not.toHaveBeenCalled();
  expect(smoke).not.toHaveBeenCalled();
  expect(metrics.cachedChecks).toEqual([]);
});

it("lints the whole repository through Turbo only for broad changes", () => {
  const { model } = project();
  const narrow = verificationPlan(model, ["packages/tokens/src/index.ts"]);
  const broad = verificationPlan(model, ["package.json"]);
  expect(narrow.reasons).toEqual([]);
  expect(executionTasks(narrow, "//")).not.toContain("//#lint");
  expect(executionTasks(broad, "//")).toContain("//#lint");
  expect(executionTasks(verificationPlan(model, [], { full: true }), "//")).toContain("//#lint");
  expect(executionTasks(broad, "//", [], "tests")).not.toContain("//#lint");
});
