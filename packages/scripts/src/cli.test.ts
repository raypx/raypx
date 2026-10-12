import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { REPOSITORY_ENV_KEY } from "./runtime/env.js";
import { repositoryRoot } from "./runtime/repository.js";

const cliPath = fileURLToPath(new URL("./cli.ts", import.meta.url));
const { FORCE_COLOR: _forceColor, ...baseEnvironment } = process.env;
const runnerEnvironment = {
  ...baseEnvironment,
  [REPOSITORY_ENV_KEY]: repositoryRoot,
  NO_COLOR: "1",
};

function runCli(args: readonly string[], environment: NodeJS.ProcessEnv = runnerEnvironment) {
  return spawnSync("bun", [cliPath, ...args], {
    encoding: "utf8",
    env: environment,
  });
}

describe("vmx CLI", () => {
  it("shows root help and version metadata", () => {
    const help = runCli(["--help"]);
    const version = runCli(["--version"]);

    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Voidmix repository automation");
    expect(help.stdout).toContain("db");
    expect(help.stdout).toContain("admin");
    expect(help.stdout).toContain("desktop");
    expect(help.stdout).toContain("doctor");
    expect(help.stdout).toContain("deps");
    expect(help.stdout).toContain("tasks");
    expect(version.status).toBe(0);
    expect(version.stdout).toBe("0.0.0\n");
  });

  it.each([
    [
      ["db", "--help"],
      ["clean", "migrate", "push", "seed", "studio"],
    ],
    [["admin", "--help"], ["create"]],
    [["desktop", "--help"], ["build"]],
    [
      ["deps", "--help"],
      ["check", "update", "dedupe", "audit"],
    ],
    [["skills", "--help"], ["update"]],
  ])("shows nested help for %s", (args, expectedCommands) => {
    const result = runCli(args);

    expect(result.status).toBe(0);
    for (const command of expectedCommands) expect(result.stdout).toContain(command);
  });

  it.each([["unknown"], ["db:migrate"], ["admin:create"], ["desktop:build"]])(
    "rejects unsupported command %s",
    (command) => {
      const result = runCli([command]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Unknown command ${command}`);
    },
  );

  it("shows help without initializing business environment schemas", () => {
    const environment = { ...runnerEnvironment, NODE_ENV: "invalid-for-schema" };
    const cleanHelp = runCli(["clean", "--help"], environment);

    expect(runCli(["--help"], environment).status).toBe(0);
    expect(cleanHelp.status).toBe(0);
    expect(cleanHelp.stdout).toContain("--dependencies");
    expect(cleanHelp.stdout).toContain("--bun-cache");
    expect(runCli(["doctor", "--help"], environment).status).toBe(0);
    const verifyHelp = runCli(["verify", "--help"], environment);
    expect(verifyHelp.status).toBe(0);
    expect(verifyHelp.stdout).toContain("--verbose");
  });

  it("runs env commands without initializing the scripts environment", () => {
    const result = runCli(["env", "--", "bun", "-e", 'process.stdout.write("bootstrap-ok")'], {
      ...runnerEnvironment,
      NODE_ENV: "invalid-for-schema",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe("bootstrap-ok");
    expect(result.stderr).toBe("");
  });

  it("does not consume help flags after the env separator", () => {
    const result = runCli([
      "env",
      "--",
      "node",
      "-e",
      "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
      "--",
      "--help",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('["--help"]');
  });

  it("propagates the child exit code", () => {
    const result = runCli(["env", "--", "node", "-e", "process.exit(7)"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(7);
    expect(result.signal).toBeNull();
  });

  it("propagates the child termination signal", () => {
    const result = runCli(["env", "--", "node", "-e", 'process.kill(process.pid, "SIGTERM")']);

    expect(result.error).toBeUndefined();
    expect(result.status).toBeNull();
    expect(result.signal).toBe("SIGTERM");
  });
});
