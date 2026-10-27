import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { taskModel, taskPlan, taskRef } from "../../src/tasks/model.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture, member } = workspaceFixtures();

function repository(rust: boolean) {
  const root = fixture();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ ...manifest, name: "fixture", packageManager: "bun@1.4.4" }),
  );
  writeFileSync(join(root, ".nvmrc"), "24.15.0\n");
  if (rust) writeFileSync(join(root, "Cargo.toml"), '[workspace]\nmembers = ["crates/*"]\n');
  member(root, "library", {
    extra: { scripts: { check: "bun check.ts", test: "bun test.ts", build: "bun build.ts" } },
  });
  return taskModel(root);
}

it("includes uncached Cargo gates in repository verification while keeping Bun selection scoped", () => {
  const model = repository(true);
  for (const name of ["verify", "verify:quick"]) {
    const plan = taskPlan(model, [taskRef("fixture", name)]);
    for (const gate of ["check", "test", "lint", "format"]) {
      const task = plan.find((candidate) => candidate.taskId === `fixture#rust:${gate}`);
      expect(task?.command).toContain("cargo ");
      expect(task?.cache).toBe(false);
    }
    expect(plan.some((task) => task.taskId === "fixture#rust:build")).toBe(name === "verify");
    expect(plan.find((task) => task.taskId === "fixture#rust:test")?.command).toBe(
      "cargo test --workspace --locked",
    );
  }
  const rust = taskPlan(model, [taskRef("fixture", "rust:verify")]);
  expect(rust.filter((task) => task.command.startsWith("cargo "))).toHaveLength(5);
  expect(rust.some((task) => task.taskId.startsWith("@raypx/library#"))).toBe(false);
  const selected = taskPlan(model, [taskRef("@raypx/library", "build")]);
  expect(selected.some((task) => task.command.startsWith("cargo "))).toBe(false);
});

it("keeps repositories without a Cargo manifest independent of Rust", () => {
  const model = repository(false);
  const plan = taskPlan(model, [taskRef("fixture", "verify")]);
  expect(plan.some((task) => task.taskId.includes("rust:"))).toBe(false);
  expect(model.definitions.has(taskRef("fixture", "rust:verify"))).toBe(false);
});
