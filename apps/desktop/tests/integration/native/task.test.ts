import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-desktop-task-"));
  roots.push(root);
  mkdirSync(join(root, "scripts/host"), { recursive: true });
  copyFileSync(
    join(import.meta.dirname, "../../../scripts/host/task.ts"),
    join(root, "scripts/host/task.ts"),
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      type: "module",
      scripts: Object.fromEntries(
        [
          "raypx-dev",
          "typecheck",
          "typecheck:node",
          "perf:check",
          "native:csp",
          "vp",
          "mygo:dev",
          "mygo:build",
        ].map((name) => [name, `bun record.ts ${name}`]),
      ),
    }),
  );
  writeFileSync(
    join(root, "record.ts"),
    `import { appendFileSync } from "node:fs";
const [name, ...args] = process.argv.slice(2);
const forwarded = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^RAYPX_DESKTOP_.*_ARGS$/.test(key)));
appendFileSync("events.jsonl", JSON.stringify({ name, args, forwarded, ...(process.env.RAYPX_DESKTOP_BROWSER_BUILD === "1" ? { browserBuild: true } : {}) }) + "\\n");
if (name === process.env.TASK_TEST_FAIL) process.exitCode = 7;`,
  );
  mkdirSync(join(root, "tests/native/smoke"), { recursive: true });
  for (const file of ["run", "agents-run"])
    writeFileSync(
      join(root, `tests/native/smoke/${file}.ts`),
      `process.argv.splice(2, 0, "smoke-${file}"); await import("../../../record.js");`,
    );
  return (task: string, options: { args?: string[]; forwarded?: string[]; fail?: string } = {}) => {
    const env: NodeJS.ProcessEnv = { ...process.env, TASK_TEST_FAIL: options.fail };

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
    const result = spawnSync(
      process.execPath,
      [
        "run",
        join(root, "scripts/host/task.ts"),
        task,
        // Turbo appends a task's own arguments to its script.
        ...(options.args ?? []),
        ...(options.forwarded ?? []),
      ],
      {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    const events = existsSync(join(root, "events.jsonl"))
      ? readFileSync(join(root, "events.jsonl"), "utf8")
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

describe("Desktop task entry", () => {
  it("checks renderer and scripts under Turbo without a native compiler", () => {
    const result = fixture()("check");
    expect(result.status).toBe(0);
    expect(result.events.map(({ name }) => name)).toEqual([
      "typecheck",
      "typecheck:node",
      "perf:check",
    ]);
  });

  it("uses the MyGo development leaf and preserves its arguments", () => {
    const result = fixture()("dev", { args: ["--verbose"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([{ name: "mygo:dev", args: ["--verbose"], forwarded: {} }]);
  });

  it("packages MyGo through the qualified native build leaf", () => {
    const result = fixture()("native:build", { forwarded: ["-skip-dmg"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      {
        name: "mygo:build",
        args: ["-skip-dmg"],
        forwarded: {},
      },
    ]);
  });

  it("preserves a failed check's exit status and skips remaining checks", () => {
    const result = fixture()("check", { fail: "typecheck:node" });
    expect(result.status).toBe(7);
    expect(result.events.map(({ name }) => name)).toEqual(["typecheck", "typecheck:node"]);
  });

  it("runs only the renderer build under Turbo and forwards arguments", () => {
    const result = fixture()("build", { args: ["--mode", "staging"] });
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
    ["native:agents", "smoke-agents-run", []],
  ] as const)("runs the MyGo %s gate under Turbo", (task, name, args) => {
    const result = fixture()(task, {});
    expect(result.status).toBe(0);
    expect(result.events).toEqual([{ name, args, forwarded: {} }]);
  });

  it("restores direct build arguments only inside the selected Desktop task", () => {
    const result = fixture()("build", { forwarded: ["--mode", "value with spaces"] });
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
    const result = fixture()("build:renderer");
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
    const result = fixture()("build:renderer", { args: ["--mode", "production"] });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("owns its mode");
    expect(result.events).toEqual([]);
  });
});
