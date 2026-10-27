import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  if (rust) writeFileSync(join(root, "Cargo.toml"), '[workspace]\nmembers = ["crates/*"]\n');
  member(root, "library", {
    extra: { scripts: { check: "bun check.ts", test: "bun test.ts", build: "bun build.ts" } },
  });
  return taskModel(root);
}

it("keeps Cargo gates explicit and outside default repository verification", () => {
  const model = repository(true);
  for (const name of ["verify", "verify:quick", "build", "check", "test", "lint"]) {
    const plan = taskPlan(model, [taskRef("fixture", name)]);
    expect(plan.some((task) => task.taskId.includes("rust:"))).toBe(false);
    expect(plan.some((task) => task.command.startsWith("cargo "))).toBe(false);
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

it("leaves Desktop compilation to platform CI when Linux runs library Cargo gates", () => {
  const model = repository(true);
  mkdirSync(join(model.root, "apps/desktop/src-tauri"), { recursive: true });
  writeFileSync(
    join(model.root, "apps/desktop/package.json"),
    JSON.stringify({
      name: "desktop",
      private: true,
      raypx: { kind: "app", target: "browser" },
    }),
  );
  writeFileSync(
    join(model.root, "apps/desktop/src-tauri/Cargo.toml"),
    '[package]\nname = "raypx-desktop"\n',
  );
  const plan = taskPlan(taskModel(model.root), [taskRef("fixture", "rust:verify")]);
  for (const task of plan.filter((entry) => entry.command.startsWith("cargo "))) {
    expect(task.cache).toBe(false);
    expect(task.command.includes("--exclude raypx-desktop")).toBe(
      process.platform === "linux" && !task.command.startsWith("cargo fmt"),
    );
  }
});
