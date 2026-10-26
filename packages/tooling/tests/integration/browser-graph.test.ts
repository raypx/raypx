import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
function graph(args: string[]) {
  const split = args.indexOf("--");
  const dry =
    split < 0
      ? [...args, "--dry=json"]
      : [...args.slice(0, split), "--dry=json", ...args.slice(split)];
  const result = spawnSync(process.execPath, ["run", "raypx-dev", ...dry], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as {
    tasks: { taskId: string; hash: string; cliArguments: string[] }[];
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
it.each(["web", "desktop"])("the %s entry builds only its selected surface", (surface) => {
  const tasks = graph(["tasks", `e2e:${surface}`]).tasks.map((task) => task.taskId);
  expect(tasks.includes("web#build")).toBe(surface === "web");
  expect(tasks.includes("desktop#build:renderer")).toBe(surface === "desktop");
});
it("normal Desktop builds preserve CLI packaging and strict native checks", () => {
  const tasks = graph(["tasks", "desktop#build"]).tasks.map((task) => task.taskId);
  expect(tasks).toContain("cli#build");
  expect(tasks).toContain("desktop#check");
  expect(tasks).toContain("desktop#native:prepare");
  expect(tasks).not.toContain("desktop#build:renderer");
});

it("changing browser selectors or workers preserves dependency build and check hashes", () => {
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
    expect(dependency.hash).toBe(plain.tasks.find((task) => task.taskId === taskId)?.hash);
    expect(dependency.cliArguments).toEqual([]);
  }
});
