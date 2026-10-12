import { readFile } from "node:fs/promises";
import { temporaryRepository } from "./test-fixtures.js";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { runWithRepositoryEnv } from "./env-runner.js";
import { REPOSITORY_ENV_KEY, resolveProcessEnvironment } from "./runtime/env.js";

afterEach(() => vi.restoreAllMocks());

describe("resolveProcessEnvironment", () => {
  it("keeps process values ahead of local and base files without mutating the input", async () => {
    const root = await temporaryRepository({
      ".env": "PROCESS_VALUE=base\nLOCAL_VALUE=base\nBASE_VALUE=base\n",
      ".env.local": "PROCESS_VALUE=local\nLOCAL_VALUE=local\nLOCAL_ONLY=local\n",
    });
    const processEnv = { PROCESS_VALUE: "process" };

    const result = resolveProcessEnvironment("repository", { processEnv, repositoryRoot: root });

    expect(result).toMatchObject({
      BASE_VALUE: "base",
      LOCAL_ONLY: "local",
      LOCAL_VALUE: "local",
      PROCESS_VALUE: "process",
      [REPOSITORY_ENV_KEY]: root,
    });
    expect(processEnv).toEqual({ PROCESS_VALUE: "process" });
  });

  it("allows both files to be absent", async () => {
    const root = await temporaryRepository();

    expect(
      resolveProcessEnvironment("repository", { processEnv: {}, repositoryRoot: root }),
    ).toEqual({
      [REPOSITORY_ENV_KEY]: root,
    });
  });

  it.each([
    [".env", "BASE_ONLY=base\n", { BASE_ONLY: "base" }],
    [".env.local", "LOCAL_ONLY=local\n", { LOCAL_ONLY: "local" }],
  ])("loads %s when the other file is absent", async (file, contents, expected) => {
    const root = await temporaryRepository({ [file]: contents });

    expect(
      resolveProcessEnvironment("repository", { processEnv: {}, repositoryRoot: root }),
    ).toMatchObject(expected);
  });

  it.each(["same repository", "another repository"])(
    "resolves an inherited marker from %s",
    async (name) => {
      const root = await temporaryRepository({ ".env": "FROM_FILE=value\n" });
      const same = name === "same repository";
      const parentRoot = same ? root : await temporaryRepository();
      const result = resolveProcessEnvironment("repository", {
        processEnv: { [REPOSITORY_ENV_KEY]: parentRoot, FROM_PARENT: "value" },
        repositoryRoot: root,
      });
      expect(result).toEqual({
        [REPOSITORY_ENV_KEY]: root,
        FROM_PARENT: "value",
        ...(!same ? { FROM_FILE: "value" } : {}),
      });
    },
  );
});

describe("runWithRepositoryEnv", () => {
  it("returns the child exit code", async () => {
    const root = await temporaryRepository();

    const result = await runWithRepositoryEnv([process.execPath, "-e", "process.exit(7)"], {
      processEnv: {},
      repositoryRoot: root,
      stdio: "ignore",
    });

    expect(result).toEqual({ code: 7, signal: null, stderr: "", stdout: "" });
  });

  it("passes flags, spaces, and positional arguments without rewriting them", async () => {
    const root = await temporaryRepository();
    const outputPath = join(root, "arguments.json");
    const command = [
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(process.argv.slice(1)))`,
      "argument with spaces",
      "--flag=value",
      "first",
      "second",
    ];

    await runWithRepositoryEnv(command, {
      processEnv: {},
      repositoryRoot: root,
      stdio: "ignore",
    });

    expect(await readFile(outputPath, "utf8")).toBe(
      '["argument with spaces","--flag=value","first","second"]',
    );
  });

  it("returns the signal that terminated the child", async () => {
    const root = await temporaryRepository();

    const result = await runWithRepositoryEnv(
      [process.execPath, "-e", "process.kill(process.pid, 'SIGTERM')"],
      { processEnv: {}, repositoryRoot: root, stdio: "ignore" },
    );

    expect(result.signal).toBe("SIGTERM");
  });

  it("rejects when the command cannot be started", async () => {
    const root = await temporaryRepository();

    await expect(
      runWithRepositoryEnv([join(root, "missing-command")], {
        processEnv: {},
        repositoryRoot: root,
        stdio: "ignore",
      }),
    ).rejects.toThrow();
  });
});
