import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { project } from "../../tests/helpers/verification.js";
import { verify } from "./index.js";
import { completionReport, precheckTimings, reportCiPlan } from "./report.js";
import { verificationPlan } from "./plan.js";
import * as execution from "./execution.js";

afterEach(() => vi.restoreAllMocks());

it("reports the comparison SHA and escaped browser selection reasons", () => {
  const { root, model } = project();
  const summary = join(root, "summary.md");
  vi.stubEnv("GITHUB_STEP_SUMMARY", summary);
  const baseline = "a".repeat(40);
  const plan = verificationPlan(model, []);
  plan.browser.web = { mode: "smoke", reasons: ["Changed login <view>.tsx"] };
  reportCiPlan({ ...plan, baseline, distribution: false });
  const content = readFileSync(summary, "utf8");
  expect(content).toContain(`Baseline SHA \`${baseline}\``);
  expect(content).toContain("Web browser · smoke");
  expect(content).toContain("Changed login &lt;view&gt;.tsx");
  expect(content).toContain("Desktop browser · skipped");
  expect(content).toContain("Source tests · skipped");
  expect(content).toContain("Native checks · skipped");
  expect(content).toContain("Backend integration · skipped");
  expect(content).toContain("Container smoke · skipped");
});

it("reports selected source and acceptance jobs with their native runners", () => {
  const { root, model } = project();
  const summary = join(root, "summary.md");
  vi.stubEnv("GITHUB_STEP_SUMMARY", summary);
  const plan = verificationPlan(model, [], { full: true });
  reportCiPlan({ ...plan, distribution: true });
  const content = readFileSync(summary, "utf8");
  expect(content).toContain("Source tests · selected");
  expect(content).toContain("Native checks · macos-latest, windows-latest");
  expect(content).toContain("Native distribution · selected");
  expect(content).toContain("Backend integration · selected");
  expect(content).toContain("Container smoke · selected");
});

it("replaces stale success evidence before starting checks and records a failed run", async () => {
  const { root } = project();
  const directory = join(root, ".artifacts/verification");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "latest.json");
  writeFileSync(file, JSON.stringify({ status: "passed" }));
  const checks = vi.spyOn(execution, "sourceChecks").mockImplementationOnce(async () => {
    expect(JSON.parse(readFileSync(file, "utf8")).status).toBe("running");
    throw new Error("source check failed");
  });
  await expect(verify(root, ["--no-cache"])).rejects.toThrow(/source check failed/);
  expect(checks).toHaveBeenCalledWith(root, expect.any(Object), {
    tests: expect.any(Array),
    noCache: true,
    model: expect.objectContaining({ root }),
  });
  expect(JSON.parse(readFileSync(file, "utf8")).status).toBe("failed");
});

it("rejects an incomplete Turbo run", () => {
  expect(() => completionReport([], ["api#check"])).toThrow(
    "Turbo did not execute every selected verification task",
  );
  expect(
    completionReport(
      [
        { taskId: "api#check", cached: true, durationMs: 0 },
        { taskId: "api#test", cached: false, durationMs: 900 },
      ],
      ["api#check", "api#test"],
    ),
  ).toEqual({ cacheHits: 1, cachedTasks: ["api#check"] });
});

it("records cached checks without replaying their previous execution times", () => {
  const results = [
    { taskId: "//#policy", cached: true, durationMs: 120 },
    { taskId: "//#locales", cached: false, durationMs: 35 },
  ];
  expect(precheckTimings(results, "//")).toEqual({
    policyMs: 0,
    localesMs: 35,
    cachedChecks: ["policy"],
  });
  expect(() => precheckTimings(results.slice(0, 1), "//")).toThrow(
    "Missing locales verification result",
  );
});
