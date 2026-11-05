import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  symlinkSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

const roots: string[] = [];
function fixture() {
  const repository = mkdtempSync(join(tmpdir(), "raypx-desktop-task-"));
  const workspace = join(repository, "apps/desktop");
  roots.push(repository);
  mkdirSync(join(workspace, "scripts/host"), { recursive: true });
  copyFileSync(
    join(import.meta.dirname, "../../../scripts/host/task.ts"),
    join(workspace, "scripts/host/task.ts"),
  );
  mkdirSync(join(workspace, "node_modules/@raypx"), { recursive: true });
  symlinkSync(
    resolve(import.meta.dirname, "../../../../../packages/runtime-node"),
    join(workspace, "node_modules/@raypx/runtime-node"),
    "dir",
  );
  mkdirSync(join(workspace, "node_modules/.bin"), { recursive: true });
  writeFileSync(
    join(workspace, "node_modules/.bin/vp"),
    '#!/usr/bin/env node\nprocess.argv.splice(2,0,"vp");await import("../../record.mjs");\n',
  );
  chmodSync(join(workspace, "node_modules/.bin/vp"), 0o755);
  const recorder = `import { appendFileSync } from "node:fs";
const [name, ...args] = process.argv.slice(2);
const forwarded = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^RAYPX_DESKTOP_.*_ARGS$/.test(key)));
appendFileSync(process.env.TASK_TEST_EVENTS, JSON.stringify({ name, args, forwarded, ...(process.env.RAYPX_DESKTOP_BROWSER_BUILD === "1" ? { browserBuild: true } : {}) }) + "\\n");
if (name === process.env.TASK_TEST_FAIL) process.exitCode = 7;`;
  writeFileSync(
    join(workspace, "scripts/host/generate.ts"),
    'process.argv.splice(2, 0, "native:generate"); await import("../../record.mjs");',
  );
  writeFileSync(
    join(repository, "package.json"),
    JSON.stringify({
      type: "module",
      scripts: { "raypx-dev": "node record.mjs raypx-dev" },
    }),
  );
  writeFileSync(
    join(repository, "record.mjs"),
    recorder,
  );
  writeFileSync(
    join(workspace, "record.mjs"),
    recorder,
  );
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({
      type: "module",
      scripts: Object.fromEntries(
        ["typecheck", "typecheck:node", "native:csp", "tauri:dev", "tauri:build"].map(
          (name) => [name, `node record.mjs ${name}`],
        ),
      ),
    }),
  );
  mkdirSync(join(workspace, "tests/native/smoke"), { recursive: true });
  for (const file of ["run", "agents-run"])
    writeFileSync(
      join(workspace, `tests/native/smoke/${file}.ts`),
      `process.argv.splice(2, 0, "smoke-${file}"); await import("../../../record.mjs");`,
    );
  return (
    task: string,
    options: { leaf?: boolean; args?: string[]; forwarded?: string[]; fail?: string } = {},
  ) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TASK_TEST_EVENTS: join(repository, "events.jsonl"),
      TASK_TEST_FAIL: options.fail,
    };

    delete env.RAYPX_DESKTOP_BROWSER_BUILD;
    for (const key of [
      "RAYPX_DESKTOP_CHECK_ARGS",
      "RAYPX_DESKTOP_BUILD_ARGS",
      "RAYPX_DESKTOP_DEV_ARGS",
      "RAYPX_DESKTOP_RENDERER_ARGS",
      "RAYPX_DESKTOP_NATIVE_SMOKE_ARGS",
      "RAYPX_DESKTOP_NATIVE_BUILD_ARGS",
      "RAYPX_DESKTOP_NATIVE_SMOKE_INTERACTIVE_ARGS",
      "RAYPX_DESKTOP_NATIVE_BETA_ARGS",
      "RAYPX_DESKTOP_NATIVE_AGENTS_ARGS",
    ])
      delete env[key];
    if (options.forwarded)
      env[
        `RAYPX_DESKTOP_${task === "build:renderer" ? "RENDERER" : task.toUpperCase().replaceAll(":", "_")}_ARGS`
      ] = JSON.stringify(options.forwarded);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        join(workspace, "scripts/host/task.ts"),
        ...(options.leaf ? ["--leaf"] : []),
        task,
        ...(options.args ?? []),
      ],
      {
        cwd: workspace,
        env,
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    const events = existsSync(join(repository, "events.jsonl"))
      ? readFileSync(join(repository, "events.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as { name: string; args: string[] })
      : [];
    return { ...result, events };
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Desktop task graph entry", () => {
  it("leaves default argument fields unset so direct and root commands share cache keys", () => {
    const result = fixture()("build");
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      { name: "raypx-dev", args: ["tasks", "desktop#build"], forwarded: {} },
    ]);
  });

  it.each([
    "check",
    "build",
    "dev",
    "native:build",
    "build:renderer",
    "native:smoke",
    "native:smoke:interactive",
    "native:beta",
    "native:agents",
  ])("routes direct %s through the repository graph", (task) => {
    const result = fixture()(task, { args: ["--example", "value with spaces"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      {
        name: "raypx-dev",
        args: ["tasks", `desktop#${task}`],
        forwarded: {
          [`RAYPX_DESKTOP_${task === "build:renderer" ? "RENDERER" : task.toUpperCase().replaceAll(":", "_")}_ARGS`]:
            '["--example","value with spaces"]',
        },
      },
    ]);
  });

  it("checks renderer and scripts inside VP without a native compiler", () => {
    const result = fixture()("check", { leaf: true });
    expect(result.status).toBe(0);
    expect(result.events.map(({ name }) => name)).toEqual([
      "native:generate",
      "typecheck",
      "typecheck:node",
    ]);
  });

  it("uses the Tauri development leaf and preserves its arguments", () => {
    const result = fixture()("dev", { leaf: true, args: ["--verbose"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([{ name: "tauri:dev", args: ["--verbose"], forwarded: {} }]);
  });

  it("packages Tauri through the qualified native build leaf", () => {
    const result = fixture()("native:build", { leaf: true, forwarded: ["--verbose"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      {
        name: "tauri:build",
        args: ["--verbose"],
        forwarded: { RAYPX_DESKTOP_NATIVE_BUILD_ARGS: '["--verbose"]' },
      },
    ]);
  });

  it("preserves a failed check's exit status and skips remaining checks", () => {
    const result = fixture()("check", { leaf: true, fail: "typecheck:node" });
    expect(result.status).toBe(7);
    expect(result.events.map(({ name }) => name)).toEqual([
      "native:generate",
      "typecheck",
      "typecheck:node",
    ]);
  });

  it("runs only the renderer build inside VP and forwards arguments", () => {
    const result = fixture()("build", { leaf: true, args: ["--mode", "staging"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      {
        name: "vp",
        args: ["build", "--config", "vite.app.config.ts", "--mode", "staging"],
        forwarded: {},
      },
      { name: "native:csp", args: [], forwarded: {} },
    ]);
  });

  it.each([
    ["native:smoke", "smoke-run", []],
    ["native:smoke:interactive", "smoke-run", ["--interactive"]],
    ["native:beta", "smoke-run", ["beta"]],
    ["native:agents", "smoke-agents-run", []],
  ] as const)("runs the Tauri %s gate inside VP", (task, name, args) => {
    const result = fixture()(task, { leaf: true });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([{ name, args, forwarded: {} }]);
  });

  it("restores direct build arguments only inside the selected Desktop task", () => {
    const result = fixture()("build", { leaf: true, forwarded: ["--mode", "value with spaces"] });
    expect(result.status).toBe(0);
    expect(result.events[0]?.args).toEqual([
      "build",
      "--config",
      "vite.app.config.ts",
      "--mode",
      "value with spaces",
    ]);
  });
  it("builds the separate browser renderer with CSP, without staging the CLI", () => {
    const result = fixture()("build:renderer", { leaf: true });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      {
        name: "vp",
        args: ["build", "--config", "vite.app.config.ts", "--mode", "e2e"],
        forwarded: {},
        browserBuild: true,
      },
      { name: "native:csp", args: ["artifacts/browser/client"], forwarded: {}, browserBuild: true },
    ]);
  });
  it("refuses to turn the browser-only build into a native artifact", () => {
    const result = fixture()("build:renderer", { leaf: true, args: ["--mode", "production"] });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("owns its mode");
    expect(result.events).toEqual([]);
  });
});
