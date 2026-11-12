import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { workspaceGraph, taskRef } from "../../src/workspace-graph.js";
import { turboPlan } from "../../src/turbo.js";
import { executionTasks } from "../../src/verification/execution.js";
import { verificationPlan } from "../../src/verification/plan.js";

const root = resolve(import.meta.dirname, "../../../..");
const model = workspaceGraph(root);
const graph = (owner: string, task: string) => turboPlan(root, [taskRef(owner, task)]);
const ids = (tasks: ReturnType<typeof turboPlan>) => tasks.map((task) => task.taskId);

function dryRun(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, ["run", ...args], {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  // Bun echoes the script before the plan; the plan is the last line.
  const { tasks } = JSON.parse(result.stdout.trim().split("\n").at(-1)!) as { tasks: string[] };
  return tasks;
}
it("routes a package-local browser command to its compiled artifact", () => {
  expect(dryRun(resolve(root, "apps/desktop"), ["e2e", "--dry-run"])).toEqual([
    "desktop#build:renderer",
  ]);
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
    import config from "./playwright.config.js";
    import { browserTestSettings } from "./browser-settings.js";
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
  for (const [cwd, args, expected] of [
    [root, ["e2e"], [web, desktop]],
    [root, ["e2e", "--web"], [web]],
    [root, ["e2e", "--desktop"], [desktop]],
    [resolve(root, "apps/web"), ["e2e"], [web]],
    [resolve(root, "apps/desktop"), ["e2e"], [desktop]],
  ] as const)
    expect(dryRun(cwd, [...args, "--dry-run"]).sort()).toEqual([...expected].sort());
  // Browser artifacts skip the type check and never compile the CLI.
  for (const [owner, task] of [
    ["web", "build:e2e"],
    ["desktop", "build:renderer"],
  ] as const) {
    const tasks = ids(graph(owner, task));
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
    expect(plan.find((task) => task.taskId === `desktop#${name}`)?.cacheable).toBe(false);
  }
});

it("full verification builds Bun services and the optional edge without deploying providers", () => {
  const plan = verificationPlan(model, [], { full: true });
  const tasks = ids(turboPlan(root, executionTasks(plan, model.rootName)));
  expect(tasks).toContain("api#build");
  expect(tasks).toContain("web#build");
  expect(tasks).not.toContain("relay#build");
  expect(tasks).toContain("relay-cloudflare#build");
  expect(tasks.some((task) => /#(?:deploy|plan(?::[^#]+)?|dev)$/.test(task))).toBe(false);
});
