import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { project, platformProject } from "../../tests/helpers/verification.js";
import { workspaceFixtures } from "../../tests/helpers/workspace.js";
import { taskModel, taskPlan, taskRef } from "@raypx/task-graph/model";
import { changedFiles, verificationPlan } from "./plan.js";
import { githubPlan, readGithubPlan } from "./ci.js";
import { verifyOptions } from ".";
import { executionTasks } from "./execution.js";

const { member } = workspaceFixtures();

afterEach(() => vi.restoreAllMocks());

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
  it("selects reverse transitive consumers and reserves artifacts for full verification", () => {
    const { model } = project();
    const plan = verificationPlan(model, ["packages/tokens/src/index.ts"]);
    expect(plan.workspaces).toEqual(["@raypx/bridge", "@raypx/tokens", "api"]);
    expect(plan.artifacts).toEqual([]);
    expect(plan.backend).toBe(true);
    expect(plan.native).toBe(false);
    expect(plan.browser).toBe("none");
    expect(plan.tasks).not.toContain("api#task:build");
    const full = verificationPlan(model, [], { full: true });
    expect(full.artifacts).toEqual(["api"]);
    expect(full.tasks).toContain("api#task:build");
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
  ])("runs native checks for %s: %j", (file, native) => {
    const plan = verificationPlan(platformProject(), [file]);
    expect(plan.workspaces).toEqual(["desktop"]);
    expect(plan.native).toBe(native);
    expect(plan.browser).toBe("none");
  });
  it.each([
    "packages/desktop/main.go",
    "packages/desktop/internal/desktop/preferences.go",
    "packages/desktop/tests/native/host/lifecycle_test.go",
    "packages/desktop/go.mod",
    "packages/desktop/go.sum",
  ])("keeps Go-only changes independent of renderer checks and suites: %s", (file) => {
    const plan = verificationPlan(platformProject(), [file]);
    expect(plan.workspaces).toEqual(["desktop"]);
    expect(plan.tasks).toEqual(["desktop#task:mygo:check", "desktop#task:mygo:test"]);
    expect(plan.native).toBe(true);
    expect(plan.artifacts).toEqual([]);
  });
  it("retains renderer verification for mixed changes and full native verification", () => {
    const model = platformProject();
    const go = "packages/desktop/internal/desktop/preferences.go";
    const mixed = verificationPlan(model, [go, "packages/desktop/src/index.ts"]);
    const full = verificationPlan(model, [go], { full: true });
    for (const plan of [mixed, full]) {
      expect(plan.tasks).toContain("desktop#task:check");
      expect(plan.tasks).toContain("desktop#task:test");
      expect(plan.tasks).toContain("desktop#task:mygo:test");
    }
    expect(full.tasks).toContain("api#task:check");
  });
  it("limits workflow orchestration to Dev CLI while retaining shared-action and native acceptance", () => {
    const { root } = platformProject();
    member(root, "dev-cli", {
      metadata: { kind: "tooling", target: "bun" },
      extra: { scripts: { check: "tsc --noEmit", test: "vp test --run" } },
    });
    const model = taskModel(root);
    for (const file of ["ci.yml", "container-smoke.yml", "artifact-performance.yml"]) {
      const plan = verificationPlan(model, [`.github/workflows/${file}`]);
      expect(plan.workspaces).toEqual(["@raypx/dev-cli"]);
      expect(plan.tasks).toEqual(["@raypx/dev-cli#task:check", "@raypx/dev-cli#task:test"]);
      expect(plan.backend).toBe(false);
    }
    for (const file of [
      ".github/workflows/native.yml",
      ".github/actions/native-checks/action.yml",
    ]) {
      const plan = verificationPlan(model, [file], { macos: false });
      expect(plan.workspaces).toEqual(["@raypx/dev-cli", "desktop"]);
      expect(plan.nativeRunners).toEqual(["windows-latest"]);
      expect(plan.tasks).toContain("desktop#task:mygo:test");
      expect(plan.tasks).not.toContain("desktop#task:test");
    }
    for (const file of [
      ".github/actions/setup-bun/action.yml",
      ".github/actions/vp-restore/action.yml",
    ])
      expect(verificationPlan(model, [file]).workspaces).toHaveLength(model.members.length);
    const mixed = verificationPlan(model, [".github/workflows/ci.yml", "packages/ui/src/index.ts"]);
    expect(mixed.workspaces).toContain("@raypx/dev-cli");
    expect(mixed.workspaces).toContain("@raypx/ui");
    expect(mixed.workspaces).toContain("web");
    expect(mixed.workspaces).not.toContain("api");
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
    "packages/dev-cli/src/cli.ts",
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
    ["packages/desktop/scripts/host/windows-smoke-install.ts", ["windows-latest"]],
    ["packages/desktop/internal/app/platform_darwin_test.go", ["macos-latest"]],
    ["packages/desktop/internal/desktop/process_unix.go", ["macos-latest"]],
    ["packages/desktop/internal/desktop/process_linux.go", []],
    ["packages/desktop/go.mod", ["macos-latest", "windows-latest"]],
    ["packages/contracts/src/local.ts", ["macos-latest", "windows-latest"]],
    ["packages/contracts/src/terminal.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/main.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/daemon/endpoint.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/host.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/index.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/src/runtime/process/windows.ts", ["windows-latest"]],
    ["packages/cli/scripts/prepare-herdr.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/tests/helpers/instance.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/tests/helpers/provider-proxy.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/tests/helpers/temporary.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/tests/smoke/windows-payload.ts", ["windows-latest"]],
    ["packages/cli/src/runtime/daemon/remote/control.ts", ["macos-latest", "windows-latest"]],
    ["packages/cli/tests/helpers/remote-control.ts", ["macos-latest", "windows-latest"]],
    [
      "packages/cli/tests/integration/runtime/daemon/remote/renewal.test.ts",
      ["macos-latest", "windows-latest"],
    ],
    [".github/workflows/native.yml", ["macos-latest", "windows-latest"]],
    [".github/actions/native-checks/action.yml", ["macos-latest", "windows-latest"]],
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
  it("validates CLI distribution preparation on native platforms without expanding unrelated tooling", () => {
    const { root } = platformProject();
    member(root, "tooling", {
      metadata: { kind: "tooling", target: "node" },
      extra: { scripts: { check: "tsc --noEmit", test: "vp test --run" } },
    });
    const model = taskModel(root);
    for (const file of [
      "packages/tooling/src/build/cli.ts",
      "packages/cli/scripts/archive.ts",
      "packages/cli/tests/integration/distribution/archive.test.ts",
    ])
      expect(verificationPlan(model, [file]).nativeRunners).toEqual([
        "macos-latest",
        "windows-latest",
      ]);
    expect(
      verificationPlan(model, ["packages/tooling/src/build/node-deployment.test.ts"]).nativeRunners,
    ).toEqual([]);
  });
  it("selects Windows acceptance for cross-platform runners and native gate inputs", () => {
    const { root } = platformProject();
    for (const name of ["tooling", "task-graph", "dev-cli", "runtime-node"])
      member(root, name, {
        metadata: { kind: name === "runtime-node" ? "library" : "tooling", target: "node" },
        extra: { scripts: { check: "tsc --noEmit", test: "vp test --run" } },
      });
    const model = taskModel(root);
    for (const file of [
      "packages/tooling/src/build/cli.ts",
      "packages/task-graph/tests/integration/task-leaf.test.ts",
      "packages/task-graph/src/leaf.ts",
      "packages/task-graph/src/core/run.ts",
      "packages/task-graph/src/core/arguments.ts",
      "packages/task-graph/src/delegation.ts",
      "packages/dev-cli/src/verification/plan.ts",
      "packages/dev-cli/src/verification/ci.ts",
      "packages/dev-cli/src/verification/ci.test.ts",
      "packages/dev-cli/src/verification/native-workflow.test.ts",
      "packages/dev-cli/src/validation/build-size.test.ts",
      "packages/runtime-node/src/process.ts",
      "packages/runtime-node/src/process.test.ts",
      "packages/runtime-node/src/http.test.ts",
    ]) {
      const plan = verificationPlan(model, [file], { macos: false });
      expect(plan.nativeRunners).toEqual(["windows-latest"]);
      expect(plan.tasks).toContain("desktop#task:mygo:test");
    }
    expect(
      verificationPlan(model, ["packages/task-graph/src/browser-tests.ts"], { macos: false })
        .nativeRunners,
    ).toEqual([]);
  });
  it("unions platform-specific changes and keeps release acceptance complete", () => {
    const model = platformProject();
    const files = [
      "packages/desktop/internal/process_windows.go",
      "packages/desktop/internal/process_darwin.go",
    ];
    expect(
      verificationPlan(model, ["packages/contracts/src/local.ts"], { macos: false }).nativeRunners,
    ).toEqual(["windows-latest"]);
    expect(verificationPlan(model, [files[1]!], { macos: false }).nativeRunners).toEqual([
      "macos-latest",
    ]);
    expect(verificationPlan(model, files, { macos: false }).nativeRunners).toEqual([
      "macos-latest",
      "windows-latest",
    ]);
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
    expect(changedFiles(root)).toEqual({ files: [], reasons: [] });
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
    expect(githubPlan(root, "workflow_dispatch", {}).nativeRunners).toEqual(["windows-latest"]);
    for (const macos of [true, "true"])
      expect(githubPlan(root, "workflow_dispatch", { inputs: { macos } }).nativeRunners).toEqual([
        "macos-latest",
        "windows-latest",
      ]);
    expect(
      githubPlan(root, "workflow_dispatch", { inputs: { macos: "false" } }).nativeRunners,
    ).toEqual(["windows-latest"]);
    expect(
      githubPlan(root, "push", { ref: "refs/tags/v1.0.0", inputs: { macos: false } }).nativeRunners,
    ).toEqual(["macos-latest", "windows-latest"]);
    expect(githubPlan(root, "workflow_dispatch", {}).distribution).toBe(false);
    expect(
      githubPlan(root, "workflow_dispatch", { inputs: { distribution: "true" } }).distribution,
    ).toBe(true);
    expect(githubPlan(root, "push", { ref: "refs/tags/v1.0.0" }).full).toBe(true);
    expect(githubPlan(root, "push", { ref: "refs/tags/v1.0.0" }).distribution).toBe(true);
    const unknown = githubPlan(root, "push", { before: "0".repeat(40) });
    expect(unknown.full).toBe(false);
    expect(unknown.workspaces).toHaveLength(taskModel(root).members.length);
    expect(unknown.nativeRunners).toEqual(["windows-latest"]);
    expect(unknown.artifacts).toEqual([]);
    expect(unknown.distribution).toBe(false);
    expect(unknown.containerSmoke).toBe(false);
    expect(githubPlan(root, "workflow_dispatch", {}).containerSmoke).toBe(true);
    expect(githubPlan(root, "push", { ref: "refs/tags/v1.0.0" }).containerSmoke).toBe(true);
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
    const daily = githubPlan(root, "push", { ref: "refs/heads/canary", before }, before);
    expect(daily.workspaces).toHaveLength(taskModel(root).members.length);
    expect(daily.nativeRunners).toEqual([]);
    expect(daily.artifacts).toEqual([]);
    expect(daily.browser).toBe("none");
    expect(daily.backend).toBe(false);
    expect(daily.distribution).toBe(false);
    expect(daily.containerSmoke).toBe(false);
    const release = githubPlan(root, "push", { ref: "refs/tags/v1.0.0", before });
    expect(release.artifacts).toEqual(["api"]);
    expect(release.nativeRunners).toEqual(["macos-latest", "windows-latest"]);
    expect(release.browser).toBe("all");
    expect(release.backend).toBe(true);
    expect(release.distribution).toBe(true);
    expect(release.containerSmoke).toBe(true);
  });
  it("carries failed Web changes through later canary pushes until the combined revision passes", async () => {
    const { root } = platformProject();
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
    function commit(message: string) {
      git("add", ".");
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        message,
      );
      return git("rev-parse", "HEAD");
    }
    git("init", "-q");
    const baseline = commit("verified baseline");
    const webFile = "packages/web/src/index.ts";
    writeFileSync(join(root, webFile), "export const changed = true;");
    const failed = commit("Web change");
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs/first.md"), "first note");
    const legacy = commit("old docs-only green run");
    writeFileSync(join(root, "docs/next.md"), "next note");
    const head = commit("docs-only follow-up");
    const event = join(root, ".git/event.json");
    writeFileSync(event, JSON.stringify({ ref: "refs/heads/canary", before: legacy }));
    vi.stubEnv("GITHUB_EVENT_PATH", event);
    vi.stubEnv("GITHUB_EVENT_NAME", "push");
    vi.stubEnv("GITHUB_API_URL", "https://api.github.example");
    vi.stubEnv("GITHUB_REPOSITORY", "fixture/project");
    vi.stubEnv("GITHUB_TOKEN", "fixture-token");
    vi.stubEnv("GITHUB_SHA", head);
    function run(sha: string, conclusion = "success", title = `Canary CI v1 ${sha}`) {
      return { head_sha: sha, conclusion, display_title: title };
    }
    const request = vi.fn(async () =>
      Response.json({
        workflow_runs: [
          run(head),
          run(legacy, "success", "old docs-only green run"),
          run(failed, "failure"),
          run("1".repeat(40)),
          run(baseline),
        ],
      }),
    );
    vi.stubGlobal("fetch", request);
    const retry = await readGithubPlan(root);
    expect(request).toHaveBeenCalledWith(
      new URL(
        "https://api.github.example/repos/fixture/project/actions/workflows/ci.yml/runs?branch=canary&event=push&status=success&per_page=100",
      ),
      expect.any(Object),
    );
    expect(retry.full).toBe(false);
    expect(retry.files).toContain(webFile);
    expect(retry.tasks).toContain("web#task:test");

    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github/workflows/ci.yml"),
      readFileSync(new URL("../../../../.github/workflows/ci.yml", import.meta.url)),
    );
    const renamed = commit("fix(ci): use commit subjects for run titles");
    writeFileSync(join(root, "docs/next.md"), "updated note");
    vi.stubEnv("GITHUB_SHA", commit("docs after green"));
    writeFileSync(event, JSON.stringify({ ref: "refs/heads/canary", before: renamed }));
    request.mockResolvedValueOnce(
      Response.json({
        workflow_runs: [run(renamed, "success", "fix(ci): use commit subjects for run titles")],
      }),
    );
    expect(await readGithubPlan(root)).toMatchObject({
      full: false,
      files: ["docs/next.md"],
      tasks: [],
    });

    request.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await readGithubPlan(root)).toMatchObject({
      full: true,
      containerSmoke: true,
      distribution: false,
    });
  });
  it("uses one public command with explicit full mode and strict options", () => {
    expect(verifyOptions([])).toEqual({});
    expect(verifyOptions(["--full", "--no-cache"])).toEqual({ full: true, noCache: true });
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

it("selects container acceptance for image definitions, deployment adapters and acceptance inputs", () => {
  const { model } = project();
  for (const file of [
    "deploy/compose.yaml",
    "infra/railway/railway.ts",
    "infra/railway/Dockerfile",
    "infra/railway/Caddyfile",
    "apps/api/Dockerfile",
    "apps/web/Dockerfile",
    "deploy/compose.split.yaml",
    "deploy/manifests.ts",
    "deploy/sources.ts",
    ".dockerignore",
    ".github/workflows/container-smoke.yml",
    "packages/tooling/src/build/deployment.ts",
    "packages/dev-cli/src/validation/deployment-smoke.ts",
    "packages/dev-cli/src/validation/evidence.ts",
    "packages/dev-cli/src/smoke/checks.ts",
    "apps/api/tests/fixtures/deployment.ts",
  ])
    expect(verificationPlan(model, [file]).containerSmoke).toBe(true);
  for (const file of [
    ".github/workflows/ci.yml",
    "docs/development/deployment.md",
    "packages/independent/tests/a.test.ts",
    "apps/desktop/src/routes/settings.tsx",
    "packages/api/src/server.ts",
    "packages/tokens/src/index.ts",
    "apps/api/server/app/relay.ts",
    "infra/cloudflare/src/index.ts",
    "infra/railway/stack.test.ts",
    "packages/tooling/src/build/cli.ts",
    "packages/dev-cli/src/validation/deployment.test.ts",
    "packages/dev-cli/tests/integration/deployment-smoke.test.ts",
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "vite.config.ts",
    "tsconfig.json",
  ])
    expect(verificationPlan(model, [file]).containerSmoke).toBe(false);
  expect(verificationPlan(model, [], { full: true }).containerSmoke).toBe(true);
});
it("keeps application source, dependencies and build configuration on source gates", () => {
  const model = platformProject();
  for (const file of [
    "packages/web/src/routes/index.tsx",
    "packages/ui/src/index.ts",
    "packages/feature/src/client.ts",
    "packages/feature/src/index.ts",
    "packages/web/vite.app.config.ts",
    "packages/web/package.json",
    "packages/api/src/server.ts",
    "packages/contracts/src/index.ts",
  ])
    expect(verificationPlan(model, [file]).containerSmoke).toBe(false);
  const unknown = verificationPlan(model, [], { reasons: ["Git base unavailable"] });
  expect(unknown.containerSmoke).toBe(false);
  expect(unknown.workspaces).toHaveLength(model.members.length);
  expect(unknown.native).toBe(true);
});
