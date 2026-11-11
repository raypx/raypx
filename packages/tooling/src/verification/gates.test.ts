import { rejects } from "node:assert/strict";
import { stubEnv } from "../../tests/helpers/stubs.ts";
import { copyFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { project } from "../../tests/helpers/verification.js";
import { verificationPlan } from "./plan.js";
import { githubPlan, ciGate } from "./ci.js";
import { ciOutputs, gateDefinitions, parseCiPlan, requiredGates, sourcePhases } from "./gates.js";
import { executionTasks } from "./execution.js";
import * as execution from "./execution.js";
import { assertCiResult } from "./result.js";
import { distributionRequested } from "./events.js";
import { workspaceFixtures } from "../../tests/helpers/workspace.js";

const { fixture } = workspaceFixtures();
afterEach(() => mock.restore());

describe("required CI results", () => {
  const needs = {
    changes: {
      result: "success",
      outputs: {
        backend: "false",
        browser: "false",
        native: "false",
        distribution: "false",
        container_smoke: "false",
      },
    },
    source: { result: "success" },
    "container-smoke": { result: "skipped" },
    backend: { result: "skipped" },
    browser: { result: "skipped" },
    desktop: { result: "skipped" },
  };
  it("accepts intentionally skipped gates but rejects missing, cancelled or failed required gates", () => {
    expect(() => assertCiResult(needs)).not.toThrow();
    expect(() => assertCiResult({ ...needs, source: { result: "cancelled" } })).toThrow("source");
    expect(() =>
      assertCiResult({
        ...needs,
        changes: { ...needs.changes, outputs: { ...needs.changes.outputs, native: "true" } },
      }),
    ).toThrow("desktop");
    expect(() => assertCiResult({ ...needs, changes: { result: "success", outputs: {} } })).toThrow(
      "outputs are incomplete",
    );
    expect(() => assertCiResult({ ...needs, changes: { result: "failure" } })).toThrow(
      "Change analysis",
    );
    for (const result of ["failure", "cancelled", "abandoned", "unknown"])
      expect(() => assertCiResult({ ...needs, backend: { result } })).toThrow("backend");
    expect(() => assertCiResult({ ...needs, extra: { result: "failure" } })).toThrow(
      "Unregistered CI gate extra",
    );
  });
  it("requires explicit distribution selection and rejects release/source-mode mismatches", () => {
    expect(distributionRequested("push", "refs/heads/canary")).toBe(false);
    expect(distributionRequested("pull_request", "refs/pull/1/merge")).toBe(false);
    expect(distributionRequested("push", "refs/tags/v1.0.0")).toBe(true);
    expect(distributionRequested("workflow_dispatch", "refs/tags/v1.0.0", false)).toBe(false);
    expect(distributionRequested("workflow_dispatch", "refs/heads/canary", "true")).toBe(true);
    expect(() => assertCiResult(needs, false)).not.toThrow();
    expect(() => assertCiResult(needs, true)).toThrow("does not match the event");
    expect(() =>
      assertCiResult(
        {
          ...needs,
          changes: {
            ...needs.changes,
            outputs: { ...needs.changes.outputs, distribution: "true" },
          },
        },
        true,
      ),
    ).toThrow("requires native gates");
  });
  it("reports unavailable runners without accepting incomplete native verification", () => {
    expect(() =>
      assertCiResult({
        ...needs,
        changes: { ...needs.changes, outputs: { ...needs.changes.outputs, native: "true" } },
        desktop: { result: "abandoned" },
      }),
    ).toThrow("CI runner was unavailable");
  });
  it("runs the final gate without dependencies and validates manual input against the plan", () => {
    const root = fixture();
    const { model } = project();
    const outputs = ciOutputs(
      { ...verificationPlan(model, ["README.md"]), distribution: false },
      "commit-a",
    );
    const source = resolve(import.meta.dirname, ".");
    for (const file of ["result.ts", "events.ts", "gates.ts"])
      copyFileSync(join(source, file), join(root, file));
    const execute = (request: string) =>
      Bun.spawnSync([process.execPath, join(root, "result.ts")], {
        cwd: root,
        env: {
          ...process.env,
          PATH: "",
          GITHUB_NEEDS: JSON.stringify({ ...needs, changes: { ...needs.changes, outputs } }),
          GITHUB_SHA: "commit-a",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_REF: "refs/heads/canary",
          RAYPX_DISTRIBUTION_REQUEST: request,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
    expect(execute("false").exitCode).toBe(0);
    const mismatched = execute("true");
    expect(mismatched.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(mismatched.stderr)).toContain("does not match the event");
    expect(() =>
      assertCiResult(
        { ...needs, changes: { ...needs.changes, outputs: { ...outputs, backend: "true" } } },
        false,
        "commit-a",
      ),
    ).toThrow("does not match the analyzed plan");
  });
});

it("executes the analyzed plan only on its matching commit and refuses malformed or unselected gates", async () => {
  const { root, model } = project();
  const plan = { ...verificationPlan(model, ["README.md"]), distribution: false };
  const outputs = ciOutputs(plan, "commit-a");
  expect(parseCiPlan(outputs.plan, "commit-a")).toEqual(plan);
  expect(
    requiredGates(outputs)
      .filter((gate) => gate.required)
      .map((gate) => gate.name),
  ).toEqual(["source"]);
  expect(() => parseCiPlan(outputs.plan, "commit-b")).toThrow("revision mismatch");
  for (const invalid of [
    { ...plan, tasks: null },
    { ...plan, backend: "false" },
    { ...plan, containerSmoke: undefined },
    { ...plan, browser: "unknown" },
    { ...plan, browser: ["all"] },
    { ...plan, artifacts: ["unknown"] },
    { ...plan, nativeRunners: ["windows-latest"] },
    { ...plan, distribution: true },
  ])
    expect(() =>
      parseCiPlan(JSON.stringify({ version: 2, revision: "commit-a", plan: invalid }), "commit-a"),
    ).toThrow(/CI plan/);
  expect(() =>
    parseCiPlan(JSON.stringify({ version: 1, revision: "commit-a", plan }), "commit-a"),
  ).toThrow("Unsupported");
  stubEnv("RAYPX_CI_PLAN", outputs.plan);
  stubEnv("GITHUB_SHA", "commit-a");
  await rejects(ciGate(root, ["backend"]), /was not selected/);
  await rejects(ciGate(root, ["container-smoke"]), /was not selected/);
  await rejects(ciGate(root, ["deployment"]), /Unknown internal CI gate/);
  await rejects(ciGate(root, ["unknown"]), /Unknown internal CI gate/);
  await rejects(ciGate(root, ["source"]), /Unknown internal CI gate/);
  await rejects(ciGate(root, ["source", "unknown"]), /Unknown source CI phase/);
  await rejects(ciGate(root, ["source", "tests"]), /was not selected/);
});

it.each([false, true])(
  "partitions source tasks without omissions or duplicate checks (full: %j)",
  (full) => {
    const { model } = project();
    const plan = verificationPlan(model, ["packages/tokens/src/index.ts"], { full });
    plan.tasks.push("desktop#task:mygo:check", "desktop#task:mygo:test");
    const checks = executionTasks(plan, "fixture", [], "checks");
    const tests = executionTasks(plan, "fixture", [], "tests");
    expect([...checks, ...tests].sort()).toEqual(executionTasks(plan, "fixture").sort());
    expect(checks.filter((task) => tests.includes(task))).toEqual([]);
    expect(checks).toContain("desktop#task:mygo:test");
    expect(checks).toContain("fixture#task:policy");
    expect(tests).toContain("api#task:test");
    expect(tests.every((task) => task.endsWith("#task:test"))).toBe(true);
    expect(checks.includes("api#task:build")).toBe(full);
    expect(checks.includes("fixture#task:knip")).toBe(full);
    expect(sourcePhases(plan)).toEqual(["checks", "tests"]);
    expect(sourcePhases(verificationPlan(model, ["README.md"]))).toEqual(["checks"]);
  },
);

it("dispatches both selected source phases from the commit-bound plan", async () => {
  const { root, model } = project();
  const plan = {
    ...verificationPlan(model, ["packages/tokens/src/index.ts"]),
    distribution: false,
  };
  stubEnv("RAYPX_CI_PLAN", ciOutputs(plan, "commit-a").plan);
  stubEnv("GITHUB_SHA", "commit-a");
  const checks = spyOn(execution, "sourceChecks").mockResolvedValue({
    policyMs: 0,
    localesMs: 0,
    cachedChecks: [],
    formatMs: 0,
    lintMs: 0,
    styleMs: 0,
    tasksMs: 0,
    artifactsMs: 0,
    cacheHits: 0,
  });
  for (const phase of ["checks", "tests"] as const) {
    await ciGate(root, ["source", phase]);
    expect(checks).toHaveBeenLastCalledWith(root, plan, { phase });
  }
});

it("registers every CI dependency and passes the authoritative plan to each source acceptance worker", () => {
  type Job = {
    needs?: string[];
    if?: string;
    uses?: string;
    with?: Record<string, string>;
    env?: Record<string, string>;
    outputs?: Record<string, string>;
    strategy?: { "fail-fast": boolean; matrix: { phase: string } };
    steps?: { run?: string; uses?: string; with?: Record<string, string> }[];
  };
  const workflow = Bun.YAML.parse(
    readFileSync(resolve(import.meta.dirname, "../../../../.github/workflows/ci.yml"), "utf8"),
  ) as { jobs: Record<string, Job> };
  expect(workflow.jobs.foundation!.needs!.sort()).toEqual(
    ["changes", ...gateDefinitions.map(({ name }) => name)].sort(),
  );
  expect(Object.keys(workflow.jobs).sort()).toEqual(
    ["changes", "foundation", ...gateDefinitions.map(({ name }) => name)].sort(),
  );
  for (const name of ["backend", "browser"]) {
    expect(workflow.jobs[name]!.env?.RAYPX_CI_PLAN).toBe("${{ needs.changes.outputs.plan }}");
    expect(
      workflow.jobs[name]!.steps?.some((step) => step.run === `bun run raypx-dev ci:gate ${name}`),
    ).toBe(true);
  }
  const source = workflow.jobs.source!;
  expect(source.env?.RAYPX_CI_PLAN).toBe("${{ needs.changes.outputs.plan }}");
  expect(source.strategy?.["fail-fast"]).toBe(false);
  expect(source.strategy?.matrix.phase).toBe(
    "${{ fromJSON(needs.changes.outputs.source_phases) }}",
  );
  expect(
    source.steps?.some(
      (step) => step.run === "bun run raypx-dev ci:gate source ${{ matrix.phase }}",
    ),
  ).toBe(true);
  expect(
    source.steps?.find((step) => step.uses === "./.github/actions/vp-restore")?.with?.partition,
  ).toBe("${{ matrix.phase == 'checks' && 'javascript' || 'source-tests' }}");
  const containerSmoke = workflow.jobs["container-smoke"]!;
  expect(containerSmoke.if).toBe("needs.changes.outputs.container_smoke == 'true'");
  expect(containerSmoke.uses).toBe("./.github/workflows/container-smoke.yml");
  expect(containerSmoke.with?.plan).toBe("${{ needs.changes.outputs.plan }}");
  const container = Bun.YAML.parse(
    readFileSync(
      resolve(import.meta.dirname, "../../../../.github/workflows/container-smoke.yml"),
      "utf8",
    ),
  ) as { jobs: Record<string, Job> };
  expect(container.jobs.checks!.env?.RAYPX_CI_PLAN).toBe("${{ inputs.plan }}");
  expect(
    container.jobs.checks!.steps?.some(
      (step) => step.run === "bun run raypx-dev ci:gate container-smoke",
    ),
  ).toBe(true);
  expect(workflow.jobs.changes!.outputs?.container_smoke).toBe(
    "${{ steps.plan.outputs.container_smoke }}",
  );
  expect(workflow.jobs.changes!.outputs?.source_phases).toBe(
    "${{ steps.plan.outputs.source_phases }}",
  );
});

it("requires selected container smoke results and rejects skipped or cancelled acceptance", () => {
  const needs = {
    changes: {
      result: "success",
      outputs: {
        native: "false",
        backend: "false",
        browser: "false",
        distribution: "false",
        container_smoke: "true",
      },
    },
    source: { result: "success" },
    backend: { result: "skipped" },
    browser: { result: "skipped" },
    desktop: { result: "skipped" },
    "container-smoke": { result: "success" },
  };
  expect(() => assertCiResult(needs)).not.toThrow();
  for (const result of ["skipped", "failure", "cancelled", "abandoned"])
    expect(() => assertCiResult({ ...needs, "container-smoke": { result } })).toThrow(
      /container-smoke/,
    );
});

it("accepts Windows-only manual distribution plans and retains both release-tag targets", () => {
  const { root } = project();
  const manual = githubPlan(root, "workflow_dispatch", { inputs: { distribution: true } });
  expect(manual.nativeRunners).toEqual(["windows-latest"]);
  expect(manual.distribution).toBe(true);
  expect(parseCiPlan(ciOutputs(manual, "commit-a").plan, "commit-a")).toEqual(manual);
  const release = githubPlan(root, "push", { ref: "refs/tags/v1.0.0" });
  expect(release.nativeRunners).toEqual(["macos-latest", "windows-latest"]);
  expect(parseCiPlan(ciOutputs(release, "commit-a").plan, "commit-a")).toEqual(release);
});
