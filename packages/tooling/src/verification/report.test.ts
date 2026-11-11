import { rejects } from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, mock, spyOn } from "bun:test";
import { project } from "../../tests/helpers/verification.ts";
import { verify } from "./index.ts";
import { completionReport, precheckTimings } from "./report.ts";
import * as execution from "./execution.ts";

afterEach(() => mock.restore());

it("replaces stale success evidence before starting checks and records a failed run", async () => {
  const { root } = project();
  const directory = join(root, ".artifacts/verification");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "latest.json");
  writeFileSync(file, JSON.stringify({ status: "passed" }));
  const checks = spyOn(execution, "sourceChecks").mockImplementationOnce(async () => {
    expect(JSON.parse(readFileSync(file, "utf8")).status).toBe("running");
    throw new Error("source check failed");
  });
  await rejects(verify(root, ["--no-cache"]), /source check failed/);
  expect(checks).toHaveBeenCalledWith(root, expect.any(Object), {
    tests: expect.any(Array),
    noCache: true,
  });
  expect(JSON.parse(readFileSync(file, "utf8")).status).toBe("failed");
});

it("rejects missing or incomplete VP completion reports", () => {
  const { root } = project();
  expect(() => completionReport(root, ["api#task:check"])).toThrow(
    "VP completion report is unavailable",
  );
  const directory = join(root, "node_modules/.vite/task-cache/test");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "last-summary.json"), JSON.stringify({ tasks: [] }));
  expect(() => completionReport(root, ["api#task:check"])).toThrow(
    "VP did not execute every selected verification task",
  );
  writeFileSync(
    join(directory, "last-summary.json"),
    JSON.stringify({
      tasks: [{ package_name: "api", task_name: "task:check", result: { CacheHit: {} } }],
    }),
  );
  expect(completionReport(root, ["api#task:check"])).toEqual({
    cacheHits: 1,
    cachedTasks: ["api#task:check"],
  });
});

it("records cached checks without replaying their previous execution times", () => {
  const { root } = project();
  const directory = join(root, ".artifacts/verification/prechecks");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "policy.json"), JSON.stringify({ durationMs: 120 }));
  writeFileSync(join(directory, "locales.json"), JSON.stringify({ durationMs: 35 }));
  expect(precheckTimings(root, "fixture", ["fixture#task:policy"])).toEqual({
    policyMs: 0,
    localesMs: 35,
    cachedChecks: ["policy"],
  });
  writeFileSync(join(directory, "locales.json"), JSON.stringify({ durationMs: -1 }));
  expect(() => precheckTimings(root, "fixture", [])).toThrow("Invalid locales timing evidence");
});
