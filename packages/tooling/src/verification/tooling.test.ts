import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { workspaceFixtures } from "../../tests/helpers/workspace";
import { taskModel } from "../tasks/model";
import { verificationPlan } from "./plan";

const { fixture, member } = workspaceFixtures();
function project() {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "bun@1.4.4", workspaces: ["packages/*"] }),
  );
  const scripts = { check: "bun check.ts", test: "bun --bun vp test --run" };
  member(root, "tooling", {
    metadata: { kind: "tooling", target: "bun" },
    extra: {
      scripts,
      exports: {
        "./tasks": "./src/tasks/config",
        "./build/nitro": { import: "./src/build/nitro", types: "./src/build/types" },
        "./browser-tests": "./src/browser-tests",
      },
    },
  });
  member(root, "service", { deps: { "@raypx/tooling": "workspace:*" }, extra: { scripts } });
  member(root, "downstream", { deps: { "@raypx/service": "workspace:*" }, extra: { scripts } });
  member(root, "browser", { deps: { "@raypx/tooling": "workspace:*" }, extra: { scripts } });
  member(root, "independent", { deps: { "@raypx/tooling": "workspace:*" }, extra: { scripts } });
  function write(file: string, source = "export {};") {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  }
  write("packages/tooling/src/tasks/config.ts", 'export { value } from "./model";');
  write("packages/tooling/src/tasks/model.ts", "export const value = 1;");
  write("packages/tooling/src/build/nitro.ts", 'export { value } from "./shared";');
  write("packages/tooling/src/build/shared.ts", "export const value = 1;");
  write("packages/tooling/src/build/types.ts");
  write("packages/tooling/src/browser-tests.ts");
  write(
    "packages/service/vite.app.config.ts",
    'import { value } from "@raypx/tooling/build/nitro";',
  );
  write("packages/browser/config.ts", 'import "@raypx/tooling/browser-tests";');
  write("packages/independent/vite.config.ts", 'import "@raypx/tooling/tasks";');
  const plan = (files: string[]) => verificationPlan(taskModel(root), files);
  return { root, write, plan };
}

describe("Tooling impact", () => {
  it.each([
    "src/verification/plan.ts",
    "src/validation/toolchain.ts",
    "src/policy.ts",
    "src/build/nitro.test.ts",
    "tests/helpers/workspace.ts",
  ])("keeps private inputs local: %s", (relative) => {
    const { write, plan } = project();
    const file = `packages/tooling/${relative}`;
    write(file);
    const selected = plan([file]);
    expect(selected.workspaces).toEqual(["@raypx/tooling"]);
    expect(selected.reasons).toEqual([]);
    expect(selected.deployment).toBe(false);
  });
  it.each(["shared.ts", "types.ts"])(
    "follows public export dependencies and actual consumers: %s",
    (file) => {
      const { plan } = project();
      expect(plan([`packages/tooling/src/build/${file}`]).workspaces).toEqual([
        "@raypx/downstream",
        "@raypx/service",
        "@raypx/tooling",
      ]);
    },
  );
  it("follows private helpers when a public entry exposes them", () => {
    const { write, plan } = project();
    write("packages/tooling/src/validation/shared.ts", "export const value = 1;");
    write("packages/tooling/src/build/shared.ts", 'export { value } from "../validation/shared";');
    expect(plan(["packages/tooling/src/validation/shared.ts"]).workspaces).toContain(
      "@raypx/service",
    );
  });
  it("combines private edits with ordinary source reach", () => {
    const { write, plan } = project();
    write("packages/tooling/src/verification/plan.ts");
    expect(
      plan(["packages/tooling/src/verification/plan.ts", "packages/browser/src/index.ts"])
        .workspaces,
    ).toEqual(["@raypx/browser", "@raypx/tooling"]);
  });
  it.each([
    "src/tasks/model.ts",
    "src/tasks/leaf.ts",
    "src/repository.ts",
    "src/cli.ts",
    "package.json",
    "vitest.config.ts",
    "unknown.ts",
  ])("retains all source checks for task and unclassified inputs: %s", (relative) => {
    const { write, plan } = project();
    const file = `packages/tooling/${relative}`;
    if (relative !== "package.json") write(file);
    expect(plan([file]).workspaces).toHaveLength(5);
  });
  it("broadens deleted inputs and unresolved public import graphs", () => {
    const { root, write, plan } = project();
    unlinkSync(join(root, "packages/tooling/src/build/shared.ts"));
    expect(plan(["packages/tooling/src/build/shared.ts"]).workspaces).toHaveLength(5);
    write("packages/tooling/src/build/nitro.ts", 'export { value } from "./missing";');
    write("packages/tooling/src/policy.ts");
    expect(plan(["packages/tooling/src/policy.ts"]).workspaces).toHaveLength(5);
  });
  it.each(["src/build", "src/coverage"])("includes authored helpers under %s", (directory) => {
    const { write, plan } = project();
    write(`packages/independent/${directory}/config.ts`, 'import "@raypx/tooling/build/nitro";');
    expect(plan(["packages/tooling/src/build/shared.ts"]).workspaces).toContain(
      "@raypx/independent",
    );
  });
  it.each(["await import(entry!);", "await import(`${entry}`);"])(
    "retains consumers with computed imports: %s",
    (expression) => {
      const { write, plan } = project();
      write("packages/browser/config.ts", `const entry = process.env.ENTRY; ${expression}`);
      expect(plan(["packages/tooling/src/build/shared.ts"]).workspaces).toContain("@raypx/browser");
    },
  );
});
