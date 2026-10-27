import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
function graph(args: string[]) {
  const split = args.indexOf("--");
  const dry =
    split < 0
      ? [...args, "--dry-run"]
      : [...args.slice(0, split), "--dry-run", ...args.slice(split)];
  const result = spawnSync(process.execPath, ["run", "raypx-dev", ...dry], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout) as {
    tasks: { taskId: string; command: string; dependsOn: string[]; cache: unknown }[];
  };
}
it("browser-only acceptance excludes the native SDK, CLI and full Desktop checks", () => {
  const tasks = graph(["tasks", "e2e"]).tasks.map((task) => task.taskId);
  expect(tasks).toContain("web#build");
  expect(tasks).toContain("desktop#build:renderer");
  expect(tasks).not.toContain("desktop#native:prepare");
  expect(tasks).not.toContain("desktop#check");
  expect(tasks).not.toContain("cli#build");
});
it("runs task-runner integration tests without an enclosing filesystem tracer", () => {
  const tasks = graph(["tasks", "test"]).tasks;
  expect(tasks.find((task) => task.taskId === "@raypx/tooling#test")?.cache).toBe(false);
  expect(tasks.find((task) => task.taskId === "@raypx/core#test")?.cache).not.toBe(false);
});
it.each(["web", "desktop"])("the %s entry builds only its selected surface", (surface) => {
  const tasks = graph(["tasks", `e2e:${surface}`]).tasks.map((task) => task.taskId);
  expect(tasks.includes("web#build")).toBe(surface === "web");
  expect(tasks.includes("desktop#build:renderer")).toBe(surface === "desktop");
});
it("normal Desktop builds preserve CLI packaging and strict native checks", () => {
  const plan = graph(["tasks", "desktop#build"]).tasks;
  const tasks = plan.map((task) => task.taskId);
  expect(tasks).toContain("cli#build");
  expect(tasks).toContain("desktop#check");
  expect(tasks).toContain("desktop#native:prepare");
  expect(tasks).not.toContain("desktop#build:renderer");
  for (const taskId of ["desktop#check", "desktop#build"])
    expect(plan.find((task) => task.taskId === taskId)?.cache).toMatchObject({
      input: expect.arrayContaining([".hutch/devkit/**", ".hutch/types/**"]),
    });
});

it("changing browser selectors or workers preserves dependency task definitions", () => {
  const plain = graph(["tasks", "e2e"]);
  const selected = graph([
    "tasks",
    "e2e",
    "--",
    "--workers=4",
    "--grep",
    "template",
    "--reporter=json",
  ]);
  for (const taskId of ["web#build", "web#check", "desktop#build:renderer"]) {
    const dependency = selected.tasks.find((task) => task.taskId === taskId)!;
    expect(dependency).toEqual(plain.tasks.find((task) => task.taskId === taskId));
  }
});
