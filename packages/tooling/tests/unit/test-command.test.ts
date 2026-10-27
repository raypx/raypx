import { expect, it } from "vite-plus/test";
import { packageTestArguments, planTests } from "../../src/test-command.js";
import { taskScripts } from "../../src/tasks/delegation.js";

const root = "/repo";
const members = [
  {
    name: "@raypx/tasks",
    path: "packages/tasks",
    scripts: { test: "runner", "test:unit": "runner", "test:component": "runner" },
  },
  {
    name: "api",
    path: "apps/api",
    scripts: { test: "runner", "test:postgres:cloudflare": "public" },
  },
  { name: "@raypx/e2e", path: "e2e", scripts: { e2e: "public", "e2e:web": "public" } },
  {
    name: "@raypx/tooling",
    path: "packages/tooling",
    scripts: { test: "runner", "test:inventory": "public" },
  },
];
it("preserves direct package runner flags and literal arguments while separating graph controls", () => {
  expect(
    packageTestArguments(["postgres:cloudflare", "--dry-run", "--reporter=json", "two words"]),
  ).toEqual(["postgres:cloudflare", "--dry-run", "--", "--reporter=json", "two words"]);
  expect(packageTestArguments(["postgres:cloudflare", "--", "--dry-run"])).toEqual([
    "postgres:cloudflare",
    "--",
    "--dry-run",
  ]);
});

it("preserves default aggregation and scopes packages by name, path, short name or current directory", () => {
  expect(planTests(root, root, members, [])).toMatchObject({ task: "test", args: [] });
  for (const name of ["tasks", "@raypx/tasks", "packages/tasks"])
    expect(
      planTests(root, root, members, [
        "unit",
        "--package",
        name,
        "--no-cache",
        "--",
        "--testNamePattern",
        "a b",
      ]),
    ).toMatchObject({
      task: "@raypx/tasks#test:unit",
      args: ["--no-cache", "--", "--testNamePattern", "a b"],
    });
  expect(planTests(root, "/repo/packages/tasks/tests", members, [])).toMatchObject({
    task: "@raypx/tasks#test",
  });
  expect(planTests(root, root, members, ["--", "--package", "literal"])).toMatchObject({
    task: "test",
    args: ["--", "--package", "literal"],
  });
});

it("routes E2E and repository workflows without silently turning them into a package's unit tests", () => {
  expect(
    planTests(root, "/repo/e2e", members, ["e2e", "--web", "--smoke", "--", "--workers=1"]),
  ).toMatchObject({
    task: "@raypx/e2e#e2e:web",
    args: ["--verbose", "--", "--workers=1"],
    env: { RAYPX_E2E_SURFACE: "web", RAYPX_E2E_SMOKE: "1" },
  });
  expect(planTests(root, "/repo/packages/tooling", members, ["inventory", "--layers"])).toEqual({
    kind: "inventory",
    args: ["--layers"],
  });
  expect(() => planTests(root, root, members, ["inventory", "--package", "tasks"])).toThrow(
    "does not own",
  );
  expect(() => planTests(root, root, members, ["e2e", "--package", "api"])).toThrow(
    "E2E workspace",
  );
});

it("fails on unsupported suites, empty layers, unknown or ambiguous packages before running anything", () => {
  expect(() => planTests(root, root, members, ["typo"])).toThrow("Unknown test suite");
  expect(() => planTests(root, root, members, ["integration", "-p", "tasks"])).toThrow("has no");
  expect(() => planTests(root, root, members, ["--package", "missing"])).toThrow(
    "Unknown workspace",
  );
  expect(() => planTests(root, root, members, ["--package"])).toThrow("requires");
  const ambiguous = [
    ...members,
    { name: "other-tasks", path: "apps/tasks", scripts: { test: "runner" } },
  ];
  expect(() => planTests(root, root, ambiguous, ["--package", "tasks"])).toThrow("Ambiguous");
  expect(planTests(root, root, members, ["list"])).toMatchObject({ kind: "list" });
});

it("delegates public commands to a real terminal runner and rejects cycles or missing scripts", () => {
  const manifest = {
    scripts: { e2e: "public", _e2e: "runner" },
    raypx: { taskScripts: { e2e: "_e2e" } },
  };
  expect(taskScripts(manifest)).toEqual({ e2e: "_e2e" });
  expect(() => taskScripts({ ...manifest, scripts: { e2e: "public" } })).toThrow(
    "existing scripts",
  );
  expect(() =>
    taskScripts({ ...manifest, raypx: { taskScripts: { e2e: "_e2e", _e2e: "e2e" } } }),
  ).toThrow("runner script");
});
