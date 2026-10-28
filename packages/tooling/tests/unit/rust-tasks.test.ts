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
  const model = desktopRepository();
  const plan = taskPlan(model, [taskRef("fixture", "rust:verify")]);
  for (const task of plan.filter((entry) => entry.command.startsWith("cargo "))) {
    expect(task.cache).toBe(false);
    expect(task.command.includes("--exclude raypx-desktop")).toBe(
      process.platform === "linux" && !task.command.startsWith("cargo fmt"),
    );
  }
  expect(plan.some((task) => task.taskId === "desktop#tauri:cli")).toBe(
    process.platform !== "linux",
  );
});

it.each(["build", "check", "test", "lint"])(
  "prepares the matching CLI and generated contracts before rust:%s without building the renderer",
  (name) => {
    const model = desktopRepository();
    const plan = taskPlan(model, [taskRef("fixture", `rust:${name}`)]);
    const cargo = plan.find((task) => task.taskId === `fixture#rust:${name}`)!;
    const native = process.platform !== "linux";
    expect(cargo.dependsOn).toEqual(
      native ? [taskRef("desktop", "tauri:generate"), taskRef("desktop", "tauri:cli")] : [],
    );
    expect(plan.some((task) => task.taskId === "cli#build")).toBe(native);
    expect(plan.some((task) => task.taskId === "desktop#build")).toBe(false);
    expect(plan.find((task) => task.taskId === "desktop#tauri:cli")?.dependsOn ?? []).toEqual(
      native ? [taskRef("cli", "build")] : [],
    );
  },
);

it("formats Rust without preparing binaries or building the CLI", () => {
  const model = desktopRepository();
  const plan = taskPlan(model, [taskRef("fixture", "rust:format")]);
  expect(plan.map((task) => task.taskId)).toEqual(["fixture#rust:format"]);
});
