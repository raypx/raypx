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

function desktopRepository() {
  const model = repository(true);
  member(model.root, "cli", {
    extra: { name: "cli", scripts: { build: "bun build.ts" } },
  });
  mkdirSync(join(model.root, "apps/desktop/src-tauri"), { recursive: true });
  writeFileSync(
    join(model.root, "apps/desktop/package.json"),
    JSON.stringify({
      name: "desktop",
      private: true,
      raypx: { kind: "app", target: "browser" },
      scripts: {
        build: "bun renderer.ts",
        "native:build": "bun package.ts",
        "tauri:generate": "bun generate.ts",
        "tauri:cli": "bun stage.ts",
      },
    }),
  );
  writeFileSync(
    join(model.root, "apps/desktop/src-tauri/Cargo.toml"),
    '[package]\nname = "raypx-desktop"\n',
  );
  return taskModel(model.root);
}

it("keeps generic JS tasks independent of the private Cargo pipeline", () => {
  const model = repository(true);
  for (const name of ["build", "check", "test", "lint"]) {
    expect(
      taskPlan(model, [taskRef("fixture", name)]).some((task) => task.command.startsWith("cargo ")),
    ).toBe(false);
  }
  const plan = taskPlan(model, [taskRef("fixture", "verify:rust")]);
  const rust = plan.filter((task) => task.command.startsWith("cargo "));
  expect(rust).toHaveLength(3);
  expect(rust.every((task) => task.cache === false)).toBe(true);
  expect(rust.find((task) => task.taskId.endsWith(":lint"))?.dependsOn).toContain(
    taskRef("fixture", "verify:rust:format"),
  );
  expect(rust.find((task) => task.taskId.endsWith(":test"))?.dependsOn).toContain(
    taskRef("fixture", "verify:rust:lint"),
  );
  expect(plan.some((task) => task.taskId.startsWith("@raypx/library#"))).toBe(false);
});

it("does not register Cargo verification without a Cargo manifest", () => {
  const model = repository(false);
  expect(model.definitions.has(taskRef("fixture", "verify:rust"))).toBe(false);
});

it("leaves Desktop to native CI when Linux verifies libraries", () => {
  const model = desktopRepository();
  const plan = taskPlan(model, [taskRef("fixture", "verify:rust")]);
  for (const task of plan.filter((entry) => entry.command.startsWith("cargo "))) {
    expect(task.command.includes("--exclude raypx-desktop")).toBe(
      process.platform === "linux" && !task.command.startsWith("cargo fmt"),
    );
  }
  expect(plan.some((task) => task.taskId === "desktop#tauri:cli")).toBe(
    process.platform !== "linux",
  );
  expect(plan.some((task) => task.taskId === "cli#build")).toBe(process.platform !== "linux");
  expect(plan.some((task) => task.taskId === "desktop#build")).toBe(false);
});

it("selects library packages without preparing native binaries", () => {
  const project = desktopRepository();
  const model = taskModel(project.root, undefined, '["raypx-core"]');
  const plan = taskPlan(model, [taskRef("fixture", "verify:rust")]);
  const cargo = plan.filter((entry) => entry.command.startsWith("cargo "));
  expect(cargo.filter((entry) => entry.command.includes("--package raypx-core"))).toHaveLength(2);
  expect(cargo.some((entry) => entry.command.includes("--workspace"))).toBe(false);
  expect(plan.some((task) => /^(?:cli|desktop)#/.test(task.taskId))).toBe(false);
  expect(() => taskModel(project.root, undefined, '["core; echo unsafe"]')).toThrow(
    "Invalid Cargo package selection",
  );
});

it("formats Rust without staging CLI inputs", () => {
  const model = desktopRepository();
  const plan = taskPlan(model, [taskRef("fixture", "verify:rust:format")]);
  expect(plan.map((task) => task.taskId)).toEqual(["fixture#verify:rust:format"]);
});
