import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { workspaceFixtures } from "../../tests/helpers/workspace.js";
import { taskModel } from "../tasks/model.js";
import { argumentKey } from "../tasks/arguments.js";
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
  write("packages/feature/src/adapter.ts", 'export { value } from "./value.js";');
  write("packages/feature/src/value.test.ts", 'import { value } from "./adapter.js";');
  write("packages/feature/src/other.test.ts");
  write("packages/feature/src/view.component.test.tsx", 'import { value } from "./value.js";');
  write("packages/feature/tests/integration/process.test.ts");
  write("packages/feature/tests/postgres/data.test.ts");
  const plan = (files: string[], options = {}) => verificationPlan(taskModel(root), files, options);
  return { root, write, plan };
}

describe("local related test selection", () => {
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
    write("packages/feature/src/bad.test.ts", 'import "./missing.js";');
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
  it("narrows private verification edits while retaining all affected typechecks and the canonical CI tasks", () => {
    const { root, write, plan } = project();
    member(root, "tooling", {
      metadata: { kind: "tooling", target: "bun" },
      extra: { scripts: { check: "bun check.ts", test: "bun --bun vp test --run" } },
    });
    write("packages/tooling/src/verification/plan.ts", "export const value = 1;");
    write("packages/tooling/src/verification/plan.test.ts", 'import { value } from "./plan.js";');
    const canonical = plan(["packages/tooling/src/verification/plan.ts"]);
    const selected = localTests(root, canonical);
    const refs = executionTasks(canonical, "fixture", selected);
    expect(selected.find((test) => test.workspace === "@raypx/tooling")?.mode).toBe("related");
    expect(refs).toContain("@raypx/feature#task:check");
    expect(refs).not.toContain("@raypx/feature#task:test");
    expect(canonical.tasks).toContain("@raypx/feature#task:test");
    expect(argumentKey("@raypx/tooling#test")).toBe(argumentKey("@raypx/tooling#task:test"));
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
