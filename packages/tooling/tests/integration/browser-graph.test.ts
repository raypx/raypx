import { expect, it } from "bun:test";
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
it("routes root and package-local test commands to the same qualified task graph", () => {
  const tasks = graph(["test", "unit", "--package", "tasks"]).tasks.map((task) => task.taskId);
  expect(tasks).toEqual(["@raypx/tasks#test:unit"]);
  const browser = graph([
    "test",
    "e2e",
    "--package",
    "e2e",
    "--web",
    "--",
    "--workers=1",
  ]).tasks.map((task) => task.taskId);
  expect(browser).toContain("@raypx/e2e#e2e:web");
  expect(browser).toContain("web#build:e2e");
  expect(browser).not.toContain("desktop#build:renderer");
}, 65_000); // Two cold child graphs each have a bounded 30-second process deadline.
it("package-local browser commands include their build prerequisites", () => {
  const plan = (directory: string, script: string) => {
    const child = spawnSync(process.execPath, ["run", script, "--dry-run"], {
      cwd: resolve(root, directory),
      env: process.env,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (child.status !== 0) throw new Error(child.stderr || child.stdout);
    return (JSON.parse(child.stdout) as { tasks: { taskId: string }[] }).tasks.map(
      (task) => task.taskId,
    );
  };
  const browser = plan("e2e", "e2e:web");
  expect(browser).toContain("web#build:e2e");
  expect(browser).not.toContain("desktop#build:renderer");
});
it.each(["web", "desktop"])("scopes package-owned %s E2E to its own build", (surface) => {
  const tasks = graph(["test", "e2e", "--package", surface]).tasks.map((task) => task.taskId);
  expect(tasks).toContain(`${surface}#e2e`);
  expect(tasks).toContain(surface === "web" ? "web#build:e2e" : "desktop#build:renderer");
  expect(tasks.some((task) => task.startsWith(`${surface === "web" ? "desktop" : "web"}#`))).toBe(
    false,
  );
});
it("uses Playwright project selection before planning builds", () => {
  const tasks = graph(["test", "e2e", "--", "--project=desktop"]).tasks.map((task) => task.taskId);
  expect(tasks).toContain("desktop#build:renderer");
  expect(tasks).not.toContain("web#build:e2e");
  expect(tasks).not.toContain("web#check");
});
it("lists browser cases without building or checking an application", () => {
  expect(graph(["test", "e2e", "--", "--list"]).tasks).toEqual([]);
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
it("browser-only acceptance excludes CLI builds and full Desktop checks", () => {
  const tasks = graph(["tasks", "e2e"]).tasks.map((task) => task.taskId);
  expect(tasks).toContain("web#build:e2e");
  expect(tasks).toContain("desktop#build:renderer");
  expect(tasks).not.toContain("desktop#check");
  expect(tasks).not.toContain("web#check");
  expect(tasks).not.toContain("cli#build");
});
it.each(["web", "desktop"])("the %s entry builds only its selected surface", (surface) => {
  const tasks = graph(["tasks", `e2e:${surface}`]).tasks.map((task) => task.taskId);
  expect(tasks.includes("web#build:e2e")).toBe(surface === "web");
  expect(tasks.includes("desktop#build:renderer")).toBe(surface === "desktop");
});
it("normal Desktop builds render the app without staging a CLI", () => {
  const plan = graph(["tasks", "desktop#build"]).tasks;
  const tasks = plan.map((task) => task.taskId);
  expect(tasks).not.toContain("cli#build");
  expect(tasks).toContain("desktop#check");
  expect(tasks).not.toContain("desktop#build:renderer");
});

it("packages Desktop explicitly with the matching CLI and without caching native packaging", () => {
  const plan = graph(["tasks", "desktop#native:build"]).tasks;
  const tasks = plan.map((task) => task.taskId);
  expect(tasks).toContain("desktop#build");
  expect(tasks).toContain("cli#build");
  expect(plan.find((task) => task.taskId === "desktop#native:build")?.cache).toBe(false);
});

it.each(["native:smoke", "native:smoke:interactive", "native:agents"])(
  "%s builds the matching CLI and renderer before native verification",
  (name) => {
    const plan = graph(["tasks", `desktop#${name}`]).tasks;
    expect(plan.map((task) => task.taskId)).toEqual(
      expect.arrayContaining(["desktop#build", "cli#build"]),
    );
    expect(plan.find((task) => task.taskId === `desktop#${name}`)?.cache).toBe(false);
  },
);

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
  for (const taskId of ["web#build:e2e", "desktop#build:renderer"]) {
    const dependency = selected.tasks.find((task) => task.taskId === taskId)!;
    expect(dependency).toEqual(plain.tasks.find((task) => task.taskId === taskId)!);
  }
});

it("full verification builds Bun services and the optional edge without deploying providers", () => {
  const result = spawnSync(process.execPath, ["run", "verify", "--full", "--dry-run"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const tasks = (JSON.parse(result.stdout) as { graph: { taskId: string }[] }).graph.map(
    (task) => task.taskId,
  );
  expect(tasks).toContain("api#build");
  expect(tasks).toContain("web#build");
  expect(tasks).not.toContain("relay#build");
  expect(tasks).toContain("relay-cloudflare#build");
  expect(tasks.some((task) => /#(?:deploy|plan(?::[^#]+)?|dev)$/.test(task))).toBe(false);
});
