import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { taskModel, taskPlan, taskRef } from "../../src/tasks/model.ts";
import { executionTasks } from "../../src/verification/execution.ts";
import { verificationPlan } from "../../src/verification/plan.ts";

const root = resolve(import.meta.dirname, "../../../..");
const model = taskModel(root);
const graph = (owner: string, task: string) => taskPlan(model, [taskRef(owner, task)]);
const ids = (tasks: ReturnType<typeof taskPlan>) => tasks.map((task) => task.taskId);

function dryRun(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, ["run", ...args], {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const { tasks } = JSON.parse(result.stdout) as { tasks: { taskId: string }[] };
  return tasks.map((task) => task.taskId);
}
it("routes a package-local browser command to its compiled artifact", () => {
  expect(dryRun(resolve(root, "apps/desktop"), ["e2e", "--dry-run"])).toEqual(
    ids(graph("desktop", "e2e")),
  );
});
it("lists browser cases without building or checking an application", () => {
  expect(dryRun(root, ["test", "e2e", "--dry-run", "--", "--list"])).toEqual([]);
});
it("loads Playwright settings from E2E and intersects smoke and user filters", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--no-env-file",
      "-e",
      `
    import config from "./playwright.config.ts";
    import { browserTestSettings } from "./browser-settings.ts";
    const capacities = [[8, 16], [16, 32], [12, 24], [4, 16], [8, 8], [1, 16]];
    const localWorkers = capacities.map(([cpus, gib]) =>
      browserTestSettings({}, { cpus, memoryBytes: gib * 2 ** 30 }).workers);
    const local = browserTestSettings({}, { cpus: 16, memoryBytes: 64 * 2 ** 30 });
    console.log(JSON.stringify({
      projects: config.projects.map(({ name }) => name),
      trace: config.use.trace,
      screenshot: config.use.screenshot,
      workers: config.workers,
      grep: ["versions a template @smoke", "versions a template", "opens memory @smoke"]
        .map(title => config.grep.test(title)),
      localWorkers,
      localTrace: local.trace,
      localHasGrep: Boolean(local.grep),
    }));
  `,
    ],
    {
      cwd: resolve(root, "e2e"),
      env: {
        ...process.env,
        CI: "true",
        RAYPX_E2E_SURFACE: "desktop",
        RAYPX_E2E_SMOKE: "1",
        RAYPX_E2E_GREP: "template",
      },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (child.status !== 0) throw new Error(child.stderr || child.stdout);
  expect(JSON.parse(child.stdout)).toEqual({
    projects: ["desktop"],
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    workers: 2,
    grep: [true, false, false],
    localWorkers: [4, 8, 4, 2, 2, 1],
    localTrace: "off",
    localHasGrep: false,
  });
});
it("builds only the browser artifacts selected by the root or package entry", () => {
  const web = "web#build:e2e";
  const desktop = "desktop#build:renderer";
  for (const [owner, task, expected] of [
    [model.rootName, "e2e", [web, desktop]],
    [model.rootName, "e2e:web", [web]],
    [model.rootName, "e2e:desktop", [desktop]],
    ["web", "e2e", [web]],
    ["desktop", "e2e", [desktop]],
  ] as const) {
    const tasks = ids(graph(owner, task));
    expect(tasks.filter((id) => id === web || id === desktop).sort()).toEqual([...expected].sort());
    for (const extra of ["desktop#check", "web#check", "cli#build"])
      expect(tasks).not.toContain(extra);
  }
});

it("stages the matching CLI for native packaging and acceptance only", () => {
  const build = ids(graph("desktop", "build"));
  expect(build).toContain("desktop#check");
  expect(build).not.toContain("cli#build");
  expect(build).not.toContain("desktop#build:renderer");
  for (const name of [
    "native:build",
    "native:smoke",
    "native:smoke:interactive",
    "native:agents",
  ]) {
    const plan = graph("desktop", name);
    expect(ids(plan)).toEqual(expect.arrayContaining(["desktop#build", "cli#build"]));
    expect(plan.find((task) => task.taskId === `desktop#${name}`)?.cache).toBe(false);
  }
});

it("full verification builds Bun services and the optional edge without deploying providers", () => {
  const plan = verificationPlan(model, [], { full: true });
  const tasks = ids(taskPlan(model, executionTasks(plan, model.rootName)));
  expect(tasks).toContain("api#build");
  expect(tasks).toContain("web#build");
  expect(tasks).not.toContain("relay#build");
  expect(tasks).toContain("relay-cloudflare#build");
  expect(tasks.some((task) => /#(?:deploy|plan(?::[^#]+)?|dev)$/.test(task))).toBe(false);
});
