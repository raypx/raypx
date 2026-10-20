import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-desktop-task-"));
  roots.push(root);
  mkdirSync(join(root, "scripts/native"), { recursive: true });
  copyFileSync(
    join(import.meta.dirname, "../../../scripts/native/task.ts"),
    join(root, "scripts/native/task.ts"),
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
          "typecheck:native",
          "native:cli",
          "native:prepare",
        ].map((name) => [name, `bun record.ts ${name}`]),
      ),
    }),
  );
  writeFileSync(
    join(root, "record.ts"),
    `import { appendFileSync } from "node:fs";
const [name, ...args] = process.argv.slice(2);
const forwarded = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^RAYPX_DESKTOP_.*_ARGS$/.test(key)));
appendFileSync("events.jsonl", JSON.stringify({ name, args, forwarded }) + "\\n");
if (name === process.env.TASK_TEST_FAIL) process.exitCode = 7;`,
  );
  return (
    task: string,
    options: { turbo?: boolean; args?: string[]; forwarded?: string[]; fail?: string } = {},
  ) => {
    const env: NodeJS.ProcessEnv = { ...process.env, TASK_TEST_FAIL: options.fail };
    delete env.TURBO_HASH;
    for (const key of [
      "RAYPX_DESKTOP_CHECK_ARGS",
      "RAYPX_DESKTOP_BUILD_ARGS",
      "RAYPX_DESKTOP_DEV_ARGS",
    ])
      delete env[key];
    if (options.turbo) env.TURBO_HASH = "fixture-task-hash";
    if (options.forwarded)
      env[`RAYPX_DESKTOP_${task.toUpperCase()}_ARGS`] = JSON.stringify(options.forwarded);
    const result = spawnSync(
      process.execPath,
      ["run", join(root, "scripts/native/task.ts"), task, ...(options.args ?? [])],
      {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    const events = readFileSync(join(root, "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { name: string; args: string[] });
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

  it.each(["check", "build", "dev"])("routes direct %s through the repository graph", (task) => {
    const result = fixture()(task, { args: ["--example", "value with spaces"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      {
        name: "raypx-dev",
        args: ["tasks", `desktop#${task}`],
        forwarded: {
          [`RAYPX_DESKTOP_${task.toUpperCase()}_ARGS`]: '["--example","value with spaces"]',
        },
      },
    ]);
  });

  it("runs checks in order inside Turbo without preparing a second time", () => {
    const result = fixture()("check", { turbo: true });
    expect(result.status).toBe(0);
    expect(result.events.map(({ name }) => name)).toEqual([
      "typecheck",
      "typecheck:node",
      "typecheck:native",
    ]);
  });

  it("preserves a failed check's exit status and skips remaining checks", () => {
    const result = fixture()("check", { turbo: true, fail: "typecheck:node" });
    expect(result.status).toBe(7);
    expect(result.events.map(({ name }) => name)).toEqual(["typecheck", "typecheck:node"]);
  });

  it("runs only the renderer build inside Turbo and forwards arguments", () => {
    const result = fixture()("build", { turbo: true, args: ["--mode", "staging"] });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      {
        name: "raypx-dev",
        args: ["env", "--", process.execPath, "--bun", "vp", "build", "--mode", "staging"],
        forwarded: {},
      },
    ]);
  });

  it("stages the already-built CLI before development without another preparation", () => {
    const result = fixture()("dev", { turbo: true });
    expect(result.status).toBe(0);
    expect(result.events).toEqual([
      { name: "native:cli", args: [], forwarded: {} },
      {
        name: "raypx-dev",
        args: ["env", "--", process.execPath, "run", "scripts/native/dev.ts"],
        forwarded: {},
      },
    ]);
  });

  it("restores direct build arguments only inside the selected Desktop task", () => {
    const result = fixture()("build", { turbo: true, forwarded: ["--mode", "value with spaces"] });
    expect(result.status).toBe(0);
    expect(result.events[0]?.args).toEqual([
      "env",
      "--",
      process.execPath,
      "--bun",
      "vp",
      "build",
      "--mode",
      "value with spaces",
    ]);
  });
});
