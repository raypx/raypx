import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { workspaceFixtures } from "../helpers/workspace.js";
import { taskModel, taskPlan, taskRef } from "../../src/tasks/model.js";
import { changedFiles, githubPlan, verificationPlan } from "../../src/verification/plan.js";
import { verifyOptions } from "../../src/verification/index.js";
import { assertCiResult } from "../../src/verification/result.js";
import { completionReport } from "../../src/verification/report.js";
import { distributionRequested } from "../../src/verification/events.js";

const { fixture, member } = workspaceFixtures();
afterEach(() => vi.unstubAllEnvs());
function project() {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "bun@1.4.4", workspaces: ["packages/*"] }),
  );
  member(root, "tokens", { extra: { scripts: { check: "bun check.ts", test: "bun test.ts" } } });
  member(root, "bridge", {
    deps: { "@raypx/tokens": "workspace:*" },
    extra: { scripts: { check: "bun check.ts" } },
  });
  member(root, "api", {
    deps: { "@raypx/bridge": "workspace:*" },
    extra: {
      name: "api",
      scripts: { check: "bun check.ts", test: "bun test.ts", build: "bun build.ts" },
    },
  });
  member(root, "independent", {
    extra: { scripts: { check: "bun check.ts", test: "bun test.ts" } },
  });
  return { root, model: taskModel(root) };
}
describe("affected verification", () => {
  it("normalizes the selected repository root and isolates nested test repositories", () => {
    const { root } = project(),
      other = project();
    vi.stubEnv("RAYPX_VERIFY_ROOT", root + "/");
    vi.stubEnv("RAYPX_VERIFY_TASKS", JSON.stringify([taskRef("api", "build")]));
    expect(taskModel(root).definitions.get(taskRef("fixture", "verify:run"))?.dependsOn).toEqual([
      taskRef("api", "build"),
    ]);
    expect(
      taskModel(other.root).definitions.get(taskRef("fixture", "verify:run"))?.dependsOn,
    ).toEqual([]);
  });
  it("selects reverse transitive consumers and their artifacts without unrelated packages", () => {
    const { model } = project();
    const plan = verificationPlan(model, ["packages/tokens/src/index.ts"], { artifacts: true });
    expect(plan.workspaces).toEqual(["@raypx/bridge", "@raypx/tokens", "api"]);
    expect(plan.artifacts).toEqual(["api"]);
    expect(plan.backend).toBe(true);
    expect(plan.native).toBe(false);
    expect(plan.browser).toBe("none");
    expect(plan.tasks).toContain("api#task:build");
  });
  it("keeps documentation-only feedback independent of JavaScript and native runners", () => {
    const { model } = project();
    const plan = verificationPlan(model, ["docs/development/testing.md", "AGENTS.md"]);
    expect(plan.workspaces).toEqual([]);
    expect(plan.tasks).toEqual([]);
    expect(plan.native).toBe(false);
  });
  it.each([
    "bun.lock",
    "package.json",
    ".github/actions/example/action.yml",
    "packages/tooling/src/cli.ts",
    "unknown/file.ts",
  ])("falls back to full for %s", (file) => {
    const { model } = project();
    const plan = verificationPlan(model, [file]);
    expect(plan.full).toBe(true);
    expect(plan.workspaces).toHaveLength(model.members.length);
    expect(plan.native).toBe(true);
  });
  it("preserves private VP prerequisites and rejects injected/cyclic task references", () => {
    const { root } = project();
    const ref = taskRef("api", "build");
    const model = taskModel(root, JSON.stringify([ref]));
    const plan = taskPlan(model, [taskRef("fixture", "verify:run")]);
    expect(plan.map((task) => task.taskId)).toContain("api#check");
    expect(() => taskModel(root, '["not-a-task"]')).toThrow("Invalid verification task selection");
    expect(() => taskModel(root, '["fixture#task:verify:run"]')).toThrow(
      "Invalid verification task selection",
    );
  });
  it("collects committed, staged, unstaged and untracked paths including both sides of a rename", () => {
    const { root } = project();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q");
    writeFileSync(join(root, "old name.ts"), "before");
    writeFileSync(join(root, "deleted.ts"), "before");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    git("update-ref", "refs/remotes/origin/canary", "HEAD");
    renameSync(join(root, "old name.ts"), join(root, "new name.ts"));
    git("add", "old name.ts", "new name.ts");
    unlinkSync(join(root, "deleted.ts"));
    mkdirSync(join(root, "untracked folder"));
    writeFileSync(join(root, "untracked folder/input.ts"), "new");
    const changed = changedFiles(root);
    expect(changed.reasons).toEqual([]);
    expect(changed.files).toEqual(
      expect.arrayContaining([
        "old name.ts",
        "new name.ts",
        "deleted.ts",
        "untracked folder/input.ts",
      ]),
    );
    expect(changedFiles(root, "missing-ref").reasons).not.toEqual([]);
  });
  it("runs manual/tag events fully and fails closed on unavailable push bases", () => {
    const { root } = project();
    expect(githubPlan(root, "workflow_dispatch", {}).full).toBe(true);
    expect(githubPlan(root, "workflow_dispatch", {}).distribution).toBe(false);
    expect(
      githubPlan(root, "workflow_dispatch", { inputs: { distribution: "true" } }).distribution,
    ).toBe(true);
    expect(githubPlan(root, "push", { ref: "refs/tags/v1.0.0" }).full).toBe(true);
    expect(githubPlan(root, "push", { ref: "refs/tags/v1.0.0" }).distribution).toBe(true);
    expect(githubPlan(root, "push", { before: "0".repeat(40) }).full).toBe(true);
    expect(githubPlan(root, "push", { before: "0".repeat(40) }).distribution).toBe(false);
  });
  it("uses one public command with explicit full mode and strict options", () => {
    expect(verifyOptions([])).toEqual({});
    expect(verifyOptions(["--full", "--base", "HEAD~1", "--dry-run"])).toEqual({
      full: true,
      base: "HEAD~1",
      dry: true,
    });
    expect(() => verifyOptions(["--base"])).toThrow("Usage:");
    expect(() => verifyOptions(["--unknown"])).toThrow("Usage:");
  });
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
      },
    },
    javascript: { result: "success" },
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
  it("runs the final gate without dependencies and validates manual input against the plan", () => {
    const root = fixture();
    const source = resolve(import.meta.dirname, "../../src/verification");
    for (const file of ["result.ts", "events.ts"])
      copyFileSync(join(source, file), join(root, file));
    const execute = (request: string) =>
      Bun.spawnSync([process.execPath, join(root, "result.ts")], {
        cwd: root,
        env: {
          ...process.env,
          PATH: "",
          GITHUB_NEEDS: JSON.stringify(needs),
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
  });
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
  expect(completionReport(root, ["api#task:check"])).toBe(1);
});
