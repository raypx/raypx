import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vite-plus/test";
import {
  createTaskModel,
  taskRef,
  taskPlan,
  taskConfig,
  parseTaskInvocation,
  taskArguments,
  argumentKey,
  taskScripts,
  taskCacheSnapshot,
  taskSelection,
  type TaskPolicy,
  type TaskMember,
} from "./tasks.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "devkit-tasks-"));
  roots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", workspaces: ["packages/*"] }),
  );
  for (const name of ["base", "consumer"]) {
    mkdirSync(join(root, "packages", name), { recursive: true });
    writeFileSync(
      join(root, "packages", name, "package.json"),
      JSON.stringify({
        name,
        scripts: { build: "bun build.ts", check: "bun --version" },
        devDependencies: name === "consumer" ? { base: "workspace:*" } : {},
      }),
    );
  }
  const policy: TaskPolicy<TaskMember> = {
    member: (_, member) => member,
    aggregateCommand: "bun leaf.ts --aggregate",
    define: (member, name) => ({
      command: `bun ${name}.ts`,
      dependsOn:
        name === "build"
          ? [
              taskRef(member.name, "check"),
              ...member.dependencies.map((dependency) => taskRef(dependency, "build")),
            ]
          : [],
      cache: false,
    }),
  };
  return { root, policy };
}
it("shares the dependency graph across selected and aggregate tasks without executing repository config", () => {
  const { root, policy } = fixture();
  writeFileSync(join(root, "devkit.config.ts"), 'throw new Error("must not execute")');
  const ref = taskRef("consumer", "build"),
    model = createTaskModel(root, policy, JSON.stringify([ref]));
  const graph = taskPlan(model, [taskRef("fixture", "verify:run")]);
  expect(graph.map((task) => task.ref)).toEqual([
    taskRef("consumer", "check"),
    taskRef("base", "check"),
    taskRef("base", "build"),
    ref,
    taskRef("fixture", "verify:run"),
  ]);
  expect(() => createTaskModel(root, policy, '["missing"]')).toThrow(
    "Invalid verification task selection",
  );
  model.definitions.get(taskRef("base", "build"))!.dependsOn.push(ref);
  expect(() => taskPlan(model, [ref])).toThrow("Cyclic VP task dependency");
});
it("canonicalizes configuration paths and scopes ambient selectors to their repository", () => {
  const { root, policy } = fixture();
  const link = join(root, "linked-root");
  symlinkSync(root, link, "dir");
  const model = createTaskModel(root, policy);
  expect(
    taskConfig(model, pathToFileURL(join(link, "packages/base/vite.config.ts")).href).run.tasks,
  ).toHaveProperty("task:build");
  expect(
    taskSelection(root, "TASKS", "ROOT", { ROOT: join(root, "other"), TASKS: "[]" }),
  ).toBeUndefined();
  expect(taskSelection(root, "TASKS", "ROOT", { ROOT: link, TASKS: "[]" })).toBe("[]");
});
it("normalizes CLI flags while keeping arguments out of dependency keys", () => {
  const call = parseTaskInvocation("root", "consumer#test", [
    "--concurrency=1",
    "--",
    "--match",
    "a b",
  ]);
  expect(call.options).toEqual(["--concurrency-limit=1"]);
  expect(
    taskArguments("consumer#test", {
      [argumentKey("consumer#task:test")]: JSON.stringify(call.forwarded),
    }),
  ).toEqual(["--match", "a b"]);
  expect(argumentKey("consumer#test")).not.toBe(argumentKey("base#build"));
  expect(() => taskArguments("consumer#test", { [argumentKey("consumer#test")]: "{}" })).toThrow(
    "string array",
  );
  expect(() => parseTaskInvocation("root", "test", ["--filter=consumer", "--", "--run"])).toThrow(
    "package#task",
  );
  expect(
    parseTaskInvocation("root", "test", ["--filter=consumer", "--", "--run"], true).forwarded,
  ).toEqual(["--run"]);
  expect(() => taskScripts({ test: "x", runner: "y" }, { test: "runner", runner: "test" })).toThrow(
    "runner script",
  );
});
it("tracks successful artifacts independently of cache database updates", () => {
  const { root } = fixture();
  const directory = join(root, "cache");
  mkdirSync(directory);
  const before = taskCacheSnapshot(directory).artifacts;
  writeFileSync(join(directory, "cache.db"), "updated");
  expect(taskCacheSnapshot(directory, before).changed).toBe(false);
  writeFileSync(join(directory, "successful.tar.zst"), "artifact");
  expect(taskCacheSnapshot(directory, before).changed).toBe(true);
});
