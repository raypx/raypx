import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
function graph(args: string[]) {
  const result = spawnSync(process.execPath, ["run", "raypx-dev", ...args, "--dry=json"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(result.status).toBe(0);
  const data = JSON.parse(result.stdout) as { tasks: { taskId: string }[] };
  return data.tasks.map((task) => task.taskId);
}
it("browser-only acceptance excludes the native SDK, CLI and full Desktop checks", () => {
  const tasks = graph(["tasks", "e2e"]);
  expect(tasks).toContain("web#build");
  expect(tasks).toContain("desktop#build:renderer");
  expect(tasks).not.toContain("desktop#native:prepare");
  expect(tasks).not.toContain("desktop#check");
  expect(tasks).not.toContain("cli#build");
});
it.each(["web", "desktop"])("the %s entry builds only its selected surface", (surface) => {
  const tasks = graph(["tasks", `e2e:${surface}`]);
  expect(tasks.includes("web#build")).toBe(surface === "web");
  expect(tasks.includes("desktop#build:renderer")).toBe(surface === "desktop");
});
it("normal Desktop builds preserve CLI packaging and strict native checks", () => {
  const tasks = graph(["tasks", "desktop#build"]);
  expect(tasks).toContain("cli#build");
  expect(tasks).toContain("desktop#check");
  expect(tasks).toContain("desktop#native:prepare");
  expect(tasks).not.toContain("desktop#build:renderer");
});
