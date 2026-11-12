import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { workspaceFixtures } from "../../tests/helpers/workspace.js";
import { taskModel } from "@raypx/task-graph/model";
import { platformProject } from "../../tests/helpers/verification.js";
import { argumentKey } from "@raypx/task-graph/core";
import { testLayer, testSources } from "../validation/test-sources.js";
import { executionTasks } from "./execution.js";
import { verificationPlan } from "./plan.js";
import type { VerificationPlan } from "./plan.js";
import { localTests } from "./tests.js";

const { fixture, member } = workspaceFixtures();
function feature(root: string, plan: VerificationPlan) {
  return localTests(root, plan).find((test) => test.workspace === "@raypx/feature");
}
function project() {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "bun@1.4.4", workspaces: ["packages/*"] }),
  );
  const scripts = { check: "bun check.ts", test: "bun --bun vp test --run" };
  member(root, "feature", { extra: { scripts } });
  member(root, "consumer", { deps: { "@raypx/feature": "workspace:*" }, extra: { scripts } });
  member(root, "unrelated", { extra: { scripts } });
  function write(file: string, source = "export {};") {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  }
  write("packages/feature/src/value.ts", "export const value = 1;");
  write("packages/feature/src/adapter.ts", 'export { value } from "./value";');
  write("packages/feature/src/value.test.ts", 'import { value } from "./adapter";');
  write("packages/feature/src/other.test.ts");
  write("packages/feature/src/view.component.test.tsx", 'import { value } from "./value";');
  write("packages/feature/tests/integration/process.test.ts");
  write("packages/feature/tests/postgres/data.test.ts");
  const plan = (files: string[], options = {}) => verificationPlan(taskModel(root), files, options);
  return { root, write, plan };
}

describe("local related test selection", () => {
  it("does not discover JavaScript tests for a Go-only plan", () => {
    const model = platformProject();
    const plan = verificationPlan(model, ["packages/desktop/go.mod"]);
    expect(localTests(model.root, plan)).toEqual([]);
    expect(executionTasks(plan, "fixture")).toEqual([
      "fixture#task:policy",
      "fixture#task:locales",
      "desktop#task:mygo:check",
      "desktop#task:mygo:test",
    ]);
  });
  it("follows emitted JS imports transitively, retains integration checks and runs complete consumer suites", () => {
    const { root, plan } = project();
    const canonical = plan(["packages/feature/src/value.ts"]);
    const selected = localTests(root, canonical);
    expect(selected.find((test) => test.workspace === "@raypx/feature")).toMatchObject({
      mode: "related",
      files: [
        "src/value.test.ts",
        "src/view.component.test.tsx",
        "tests/integration/process.test.ts",
      ],
    });
    expect(selected.find((test) => test.workspace === "@raypx/consumer")?.mode).toBe("all");
    expect(selected.some((test) => test.workspace === "@raypx/unrelated")).toBe(false);
    expect(canonical.tasks).toContain("@raypx/feature#task:test");
    expect(executionTasks(canonical, "fixture")).toContain("@raypx/feature#task:test");
  });
  it("runs a changed component test without its unrelated suites", () => {
    const { root, plan } = project();
    const canonical = plan(["packages/feature/src/view.component.test.tsx"]);
    expect(feature(root, canonical)).toMatchObject({
      mode: "related",
      files: ["src/view.component.test.tsx"],
    });
    expect(
      localTests(root, canonical).find((test) => test.workspace === "@raypx/consumer")?.mode,
    ).toBe("none");
  });
  it("runs the complete suite when its runner has no known file filter", () => {
    const { root, plan, write } = project();
    const directory = member(root, "custom-runner", {
      extra: { scripts: { test: "bun run test.ts" } },
    });
    const changed = `${directory}/src/model.test.ts`;
    write(changed);
    write(`${directory}/src/unrelated.test.ts`);
    expect(localTests(root, plan([changed]))).toMatchObject([
      {
        workspace: "@raypx/custom-runner",
        mode: "all",
        files: [],
        reasons: ["Custom test runner"],
      },
    ]);
  });
  it("selects the CLI task lifecycle suite for its API subprocess inputs", () => {
    const { root, plan, write } = project();
    const scripts = { check: "bun check.ts", test: "bun --bun vp test --run" };
    const api = member(root, "api", { extra: { name: "api", scripts } });
    const cli = member(root, "cli", { extra: { name: "cli", scripts } });
    const lifecycle = "tests/integration/runtime/daemon/task-lifecycle.test.ts";
    const other = "src/other.test.ts";
    write(`${cli}/${lifecycle}`);
    write(`${cli}/${other}`);
    for (const file of ["tests/fixtures/task-lifecycle-relay.ts", "tests/helpers/relay.ts"]) {
      const changed = `${api}/${file}`;
      write(changed);
      const canonical = plan([changed]);
      expect(canonical.workspaces).toEqual(["api", "cli"]);
      expect(canonical.tasks).toContain("cli#task:test");
      expect(canonical.tasks).not.toContain("cli#task:check");
      expect(canonical.native).toBe(false);
      const task = taskModel(root).definitions.get("cli#task:test");
      expect(task?.cache).toMatchObject({
        input: expect.arrayContaining([{ pattern: changed, base: "workspace" }]),
      });
      expect(localTests(root, canonical).find((test) => test.workspace === "cli")).toMatchObject({
        mode: "related",
        files: [lifecycle],
      });
      expect(
        localTests(root, plan([changed, `${cli}/${other}`])).find(
          (test) => test.workspace === "cli",
        )?.files,
      ).toEqual([other, lifecycle]);
    }
    expect(plan([`${api}/tests/helpers/unrelated.ts`]).tasks).not.toContain("cli#task:test");
  });
  it("keeps filesystem and subprocess assertions that do not import their subject", () => {
    const { root, plan, write } = project();
    write("packages/feature/src/contract.test.ts", 'import { readFileSync } from "node:fs";');
    const selected = localTests(root, plan(["packages/feature/src/value.ts"]));
    expect(selected.find((test) => test.workspace === "@raypx/feature")?.files).toContain(
      "src/contract.test.ts",
    );
  });
  it.each([
    "packages/feature/src/unknown.ts",
    "packages/feature/tests/helpers/setup.ts",
    "packages/feature/vitest.config.ts",
    "packages/feature/src/data.json",
  ])("falls back for an unlinked source or shared input: %s", (file) => {
    const { root, plan, write } = project();
    write(file);
    expect(feature(root, plan([file]))?.mode).toBe("all");
  });
  it("falls back for deleted dependencies, parse failures and unresolved paths", () => {
    const { root, plan, write } = project();
    unlinkSync(join(root, "packages/feature/src/value.ts"));
    expect(feature(root, plan(["packages/feature/src/value.ts"]))?.mode).toBe("all");
    write("packages/feature/src/value.ts");
    write("packages/feature/src/bad.test.ts", 'import "./missing";');
    expect(feature(root, plan(["packages/feature/src/value.ts"]))?.mode).toBe("all");
    write("packages/feature/src/bad.test.ts", "const =");
    expect(feature(root, plan(["packages/feature/src/value.ts"]))?.mode).toBe("all");
  });
  it("keeps full/shared/missing-base plans complete and gives empty suites to their runner", () => {
    const { root, plan, write } = project();
    for (const scope of [
      plan([], { full: true }),
      plan(["bun.lock"]),
      plan([], { reasons: ["Missing Git base"] }),
    ])
      expect(localTests(root, scope).every((test) => test.mode === "all")).toBe(true);
    write("packages/consumer/src/changed.ts");
    expect(localTests(root, plan(["packages/consumer/src/changed.ts"]))[0]?.mode).toBe("all");
  });
  it("limits private verification edits to Dev CLI in local and canonical CI tasks", () => {
    const { root, write, plan } = project();
    member(root, "dev-cli", {
      metadata: { kind: "tooling", target: "bun" },
      extra: { scripts: { check: "bun check.ts", test: "bun --bun vp test --run" } },
    });
    write("packages/dev-cli/src/verification/plan.ts", "export const value = 1;");
    write("packages/dev-cli/src/verification/plan.test.ts", 'import { value } from "./plan";');
    const canonical = plan(["packages/dev-cli/src/verification/plan.ts"]);
    const selected = localTests(root, canonical);
    const refs = executionTasks(canonical, "fixture", selected);
    expect(selected.find((test) => test.workspace === "@raypx/dev-cli")?.mode).toBe("related");
    expect(refs).toContain("@raypx/dev-cli#task:check");
    expect(canonical.workspaces).toEqual(["@raypx/dev-cli"]);
    expect(canonical.tasks).not.toContain("@raypx/feature#task:check");
    expect(argumentKey("@raypx/dev-cli#test")).toBe(argumentKey("@raypx/dev-cli#task:test"));
  });
});

it("discovers source-adjacent suites, classifies DOM by suffix and excludes generated/dependency directories", () => {
  const { root, write } = project();
  write("packages/feature/dist/leak.test.ts");
  write("packages/feature/node_modules/leak.test.ts");
  const files = testSources(join(root, "packages/feature"));
  expect(files).not.toContain("dist/leak.test.ts");
  expect(files).not.toContain("node_modules/leak.test.ts");
  expect(testLayer("src/view.component.test.ts")).toBe("component");
  expect(testLayer("src/ssr.test.tsx")).toBe("unit");
  expect(testLayer("tests/integration/process.test.ts")).toBe("integration");
  expect(testLayer("tests/cluster/relay.test.ts")).toBe("external");
});
