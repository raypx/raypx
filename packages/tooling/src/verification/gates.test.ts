import { runProcessSync } from "@raypx/runtime-node/process";
import { parseYAML } from "confbox/yaml";
import { copyFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { project } from "../../tests/helpers/verification.ts";
import { verificationPlan } from "./plan.ts";
import { ciGate } from "./index.ts";
import { ciOutputs, gateDefinitions, parseCiPlan, requiredGates } from "./gates.ts";
import { assertCiResult } from "./result.ts";
import { distributionRequested } from "./events.ts";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";

const { fixture } = workspaceFixtures();
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("required CI results", () => {
  const needs = {
    changes: {
      result: "success",
      outputs: {
        backend: "false",
        browser: "false",
        native: "false",
        distribution: "false",
        deployment: "false",
      },
    },
    javascript: { result: "success" },
    deployment: { result: "skipped" },
    backend: { result: "skipped" },
    browser: { result: "skipped" },
    desktop: { result: "skipped" },
  };
  it("accepts intentionally skipped gates but rejects missing, cancelled or failed required gates", () => {
    expect(() => assertCiResult(needs)).not.toThrow();
    expect(() => assertCiResult({ ...needs, javascript: { result: "cancelled" } })).toThrow(
      "javascript",
    );
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
      runProcessSync([process.execPath, join(root, "result.ts")], {
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
  ).toEqual(["javascript"]);
  expect(() => parseCiPlan(outputs.plan, "commit-b")).toThrow("revision mismatch");
  for (const invalid of [
    { ...plan, tasks: null },
    { ...plan, backend: "false" },
    { ...plan, browser: "unknown" },
    { ...plan, browser: ["all"] },
    { ...plan, artifacts: ["unknown"] },
    { ...plan, nativeRunners: ["windows-latest"] },
    { ...plan, distribution: true },
  ])
    expect(() =>
      parseCiPlan(JSON.stringify({ version: 1, revision: "commit-a", plan: invalid }), "commit-a"),
    ).toThrow(/CI plan/);
  expect(() =>
    parseCiPlan(JSON.stringify({ version: 2, revision: "commit-a", plan }), "commit-a"),
  ).toThrow("Unsupported");
  vi.stubEnv("RAYPX_CI_PLAN", outputs.plan);
  vi.stubEnv("GITHUB_SHA", "commit-a");
  await expect(ciGate(root, ["backend"])).rejects.toThrow("was not selected");
  await expect(ciGate(root, ["unknown"])).rejects.toThrow("Unknown internal CI gate");
});

it("registers every CI dependency and passes the authoritative plan to each source acceptance worker", () => {
  const workflow = parseYAML<{
    jobs: Record<string, { needs?: string[]; env?: Record<string, string> }>;
  }>(readFileSync(resolve(import.meta.dirname, "../../../../.github/workflows/ci.yml"), "utf8"));
  expect(workflow.jobs.foundation!.needs!.sort()).toEqual(
    ["changes", ...gateDefinitions.map(({ name }) => name)].sort(),
  );
  expect(Object.keys(workflow.jobs).sort()).toEqual(
    ["changes", "foundation", ...gateDefinitions.map(({ name }) => name)].sort(),
  );
  for (const name of ["javascript", "backend", "browser", "deployment"])
    expect(workflow.jobs[name]!.env?.RAYPX_CI_PLAN).toBe("${{ needs.changes.outputs.plan }}");
});

it("requires selected deployment results and rejects skipped or cancelled acceptance", () => {
  const needs = {
    changes: {
      result: "success",
      outputs: {
        native: "false",
        backend: "false",
        browser: "false",
        distribution: "false",
        deployment: "true",
      },
    },
    javascript: { result: "success" },
    backend: { result: "skipped" },
    browser: { result: "skipped" },
    desktop: { result: "skipped" },
    deployment: { result: "success" },
  };
  expect(() => assertCiResult(needs)).not.toThrow();
  for (const result of ["skipped", "failure", "cancelled", "abandoned"])
    expect(() => assertCiResult({ ...needs, deployment: { result } })).toThrow(/deployment/);
});
