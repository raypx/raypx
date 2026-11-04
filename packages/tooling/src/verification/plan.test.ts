import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { project, platformProject } from "../../tests/helpers/verification.js";
import { taskModel, taskPlan, taskRef } from "../tasks/model.js";
import { changedFiles, githubPlan, verificationPlan } from "./plan.js";
import { verifyOptions } from "./index.js";
import { executionTasks } from "./execution.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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
  it("keeps browser-only changes within browser consumers", () => {
    const plan = verificationPlan(platformProject(), ["packages/ui/src/index.ts"]);
    expect(plan.workspaces).toEqual(["@raypx/feature", "@raypx/ui", "desktop", "web"]);
    expect(plan.backend).toBe(false);
    expect(plan.native).toBe(false);
    expect(plan.browser).toBe("none");
    const universal = verificationPlan(platformProject(), ["packages/feature/src/index.ts"]);
    expect(universal.workspaces).toContain("api");
    expect(universal.backend).toBe(true);
    expect(universal.native).toBe(false);
    expect(universal.tasks).not.toContain("desktop#task:mygo:test");
  });
  it.each([
    ["packages/desktop/src/index.ts", false],
    ["packages/desktop/src/app.css", false],
    ["packages/desktop/bridge.ts", true],
    ["packages/desktop/main.go", true],
    ["packages/desktop/package.json", true],
  ])("runs native checks for %s: %s", (file, native) => {
    const plan = verificationPlan(platformProject(), [file]);
    expect(plan.workspaces).toEqual(["desktop"]);
    expect(plan.native).toBe(native);
    expect(plan.browser).toBe("none");
  });
  it("follows type-only and test imports of browser entries", () => {
    const tested = verificationPlan(platformProject({ typedTest: true }), [
      "packages/ui/src/index.ts",
    ]);
    expect(tested.workspaces).toContain("@raypx/contracts");
    expect(tested.workspaces).not.toContain("api");
    const leaked = verificationPlan(platformProject({ leak: true }), ["packages/ui/src/index.ts"]);
    expect(leaked.workspaces).toContain("api");
    expect(leaked.backend).toBe(true);
  });
  it.each([
    "bun.lock",
    "package.json",
    ".github/actions/example/action.yml",
    "packages/tooling/src/cli.ts",
    "unknown/file.ts",
  ])("broadens source checks without release gates for %s", (file) => {
    const { model } = project();
    const plan = verificationPlan(model, [file]);
    expect(plan.full).toBe(false);
    expect(plan.workspaces).toHaveLength(model.members.length);
    expect(plan.native).toBe(false);
    expect(plan.nativeRunners).toEqual([]);
    expect(plan.artifacts).toEqual([]);
    expect(plan.backend).toBe(false);
    expect(plan.browser).toBe("none");
    expect(plan.tasks.every((task) => /#task:(?:check|test)$/.test(task))).toBe(true);
  });
  it.each([
    ["packages/desktop/internal/desktop/process_windows.go", ["windows-latest"]],
    ["packages/desktop/scripts/native/windows-smoke-install.ts", ["windows-latest"]],
    ["packages/desktop/internal/app/platform_darwin_test.go", ["macos-latest"]],
    ["packages/desktop/internal/desktop/process_unix.go", ["macos-latest"]],
    ["packages/desktop/internal/desktop/process_linux.go", []],
    ["packages/desktop/go.mod", ["macos-latest", "windows-latest"]],
    ["packages/contracts/src/local.ts", ["macos-latest", "windows-latest"]],
    ["packages/contracts/src/terminal.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/daemon/endpoint.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/host.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/index.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/process/windows.ts", ["windows-latest"]],
    ["packages/cli/scripts/prepare-herdr.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/tests/helpers/instance.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/daemon/remote/control.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/tests/helpers/remote-control.ts", ["macos-latest", "windows-latest"]],
    [
      "packages/cli/tests/integration/runtime/daemon/remote/renewal.test.ts",
      ["macos-latest", "windows-latest"],
    ],
    [".github/workflows/native.yml", ["macos-latest", "windows-latest"]],
    [".gitattributes", ["macos-latest", "windows-latest"]],
  ])("selects native runners from the changed input %s", (file, runners) => {
    const plan = verificationPlan(platformProject(), [file]);
    expect(plan.native).toBe(true);
    expect(plan.nativeRunners).toEqual(runners);
    expect(plan.tasks).toContain("desktop#task:mygo:test");
  });
  it("keeps CLI business logic independent of native platform runners", () => {
    const plan = verificationPlan(platformProject(), [
      "packages/cli/src/runtime/agents/providers.ts",
    ]);
    expect(plan.workspaces).toEqual(["cli"]);
    expect(plan.native).toBe(false);
    expect(plan.nativeRunners).toEqual([]);
    expect(plan.artifacts).toEqual([]);
  });
  it("unions platform-specific changes and keeps release acceptance complete", () => {
    const model = platformProject();
    const files = [
      "packages/desktop/internal/process_windows.go",
      "packages/desktop/internal/process_darwin.go",
    ];
    expect(verificationPlan(model, files).nativeRunners).toEqual([
      "macos-latest",
      "windows-latest",
    ]);
    const release = verificationPlan(model, [files[0]!], { full: true });
    expect(release.nativeRunners).toEqual(["macos-latest", "windows-latest"]);
    expect(release.browser).toBe("all");
    expect(release.backend).toBe(true);
    expect(release.tasks).toContain("desktop#task:mygo:test");
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
  it("runs manual/tag events fully and checks all sources when push bases are unavailable", () => {
    const { root } = project();
    expect(githubPlan(root, "workflow_dispatch", {}).full).toBe(true);
    expect(githubPlan(root, "workflow_dispatch", {}).distribution).toBe(false);
    expect(
      githubPlan(root, "workflow_dispatch", { inputs: { distribution: "true" } }).distribution,
    ).toBe(true);
    expect(githubPlan(root, "push", { ref: "refs/tags/v1.0.0" }).full).toBe(true);
    expect(githubPlan(root, "push", { ref: "refs/tags/v1.0.0" }).distribution).toBe(true);
    const unknown = githubPlan(root, "push", { before: "0".repeat(40) });
    expect(unknown.full).toBe(false);
    expect(unknown.workspaces).toHaveLength(taskModel(root).members.length);
    expect(unknown.nativeRunners).toEqual(["macos-latest", "windows-latest"]);
    expect(unknown.artifacts).toEqual([]);
    expect(unknown.distribution).toBe(false);
  });
  it("keeps a real dependency-only push on source checks and expands its release tag", () => {
    const { root } = project();
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
    git("init", "-q");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "base",
    );
    const before = git("rev-parse", "HEAD");
    writeFileSync(join(root, "bun.lock"), "dependency fixture");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "dependency",
    );
    const daily = githubPlan(root, "push", { ref: "refs/heads/canary", before });
    expect(daily.workspaces).toHaveLength(taskModel(root).members.length);
    expect(daily.nativeRunners).toEqual([]);
    expect(daily.artifacts).toEqual([]);
    expect(daily.browser).toBe("none");
    expect(daily.backend).toBe(false);
    expect(daily.distribution).toBe(false);
    const release = githubPlan(root, "push", { ref: "refs/tags/v1.0.0", before });
    expect(release.artifacts).toEqual(["api"]);
    expect(release.nativeRunners).toEqual(["macos-latest", "windows-latest"]);
    expect(release.browser).toBe("all");
    expect(release.backend).toBe(true);
    expect(release.distribution).toBe(true);
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

it("always selects repository policy/locales and reserves Knip for full verification", () => {
  const { root } = project();
  for (const full of [false, true]) {
    const plan = verificationPlan(taskModel(root), ["packages/tokens/src/index.ts"], { full });
    expect(executionTasks(plan, "fixture").includes("fixture#task:knip")).toBe(full);
    expect(executionTasks(plan, "fixture")).toContain("fixture#task:policy");
    expect(executionTasks(plan, "fixture")).toContain("fixture#task:locales");
  }
});

it("selects deployment acceptance for Docker, runtime and shared dependency inputs", () => {
  const { model } = project();
  for (const file of [
    "deploy/compose.yaml",
    "infra/railway/railway.ts",
    "infra/railway/Dockerfile",
    "infra/railway/Caddyfile",
    "apps/api/Dockerfile",
    "packages/api/src/server.ts",
    "bun.lock",
    "packages/tokens/src/index.ts",
  ])
    expect(verificationPlan(model, [file]).deployment).toBe(true);
  for (const file of [
    "docs/development/deployment.md",
    "packages/independent/tests/a.test.ts",
    "apps/desktop/src/routes/settings.tsx",
  ])
    expect(verificationPlan(model, [file]).deployment).toBe(false);
  expect(verificationPlan(model, [], { full: true }).deployment).toBe(true);
});
it("keeps ordinary browser edits on source gates while deployment configuration selects Docker", () => {
  const model = platformProject();
  for (const file of [
    "packages/web/src/routes/index.tsx",
    "packages/ui/src/index.ts",
    "packages/feature/src/client.ts",
  ])
    expect(verificationPlan(model, [file]).deployment).toBe(false);
  for (const file of [
    "packages/web/vite.app.config.ts",
    "packages/web/package.json",
    "packages/api/src/server.ts",
    "packages/contracts/src/index.ts",
  ])
    expect(verificationPlan(model, [file]).deployment).toBe(true);
});
