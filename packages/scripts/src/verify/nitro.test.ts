import { describe, expect, it, vi } from "vite-plus/test";
import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";

import { verifyNitroRuntimes, type NitroRuntimeTarget } from "./nitro.js";

const target = {
  directory: "apps/example",
  name: "Example",
  probes: [{ expectedText: "ready", pathname: "/" }, { pathname: "/health" }],
} as const satisfies NitroRuntimeTarget;

function dependencies() {
  return {
    log: vi.fn(),
    processEnv: {
      DATABASE_URL: "postgres://example.invalid/database",
      PATH: "/bin",
      PORT: "9999",
    },
    repositoryRoot: "/repo",
    runCommand: vi.fn<RepositoryProcessDependencies["runCommand"]>(async () => undefined),
  };
}

describe("verifyNitroRuntimes", () => {
  it("checks Bun metadata and starts the isolated output with Bun", async () => {
    const deps = dependencies();
    const cleanup = vi.fn(async () => undefined);

    await verifyNitroRuntimes(deps, {
      allocatePort: async () => 43210,
      readMetadata: async () => JSON.stringify({ preset: "bun", serverEntry: "server/index.mjs" }),
      stageOutput: async () => ({ cleanup, directory: "/isolated/.output" }),
      targets: [target],
    });

    expect(deps.runCommand).toHaveBeenCalledOnce();
    const [command, options] = deps.runCommand.mock.calls[0] ?? [];
    expect(command?.slice(0, 5)).toEqual([
      "bun",
      "--no-env-file",
      "--no-install",
      "--eval",
      expect.any(String),
    ]);
    expect(command?.slice(5)).toEqual([
      "file:///isolated/.output/server/index.mjs",
      "Example",
      JSON.stringify(target.probes),
    ]);
    expect(options).toEqual({
      captureOutput: false,
      cwd: "/isolated/.output",
      timeoutMs: 30_000,
      env: expect.objectContaining({
        ALLOWED_ORIGINS: "http://localhost:3000",
        DATABASE_URL: "postgres://raypx:verify@example.invalid:5432/raypx",
        LOG_LEVEL: "error",
        LOG_PRETTY: "false",
        NITRO_HOST: "127.0.0.1",
        NITRO_PORT: "43210",
        NODE_ENV: "production",
        PATH: "/bin",
        PORT: "43210",
      }),
    });
    expect(options?.env).toHaveProperty(
      "DATABASE_URL",
      "postgres://raypx:verify@example.invalid:5432/raypx",
    );
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans the staged output after a failed or timed-out child closes", async () => {
    const deps = dependencies();
    const cleanup = vi.fn(async () => undefined);
    deps.runCommand.mockRejectedValue(new Error("probe timed out"));
    await expect(
      verifyNitroRuntimes(deps, {
        allocatePort: async () => 43210,
        readMetadata: async () =>
          JSON.stringify({ preset: "bun", serverEntry: "server/index.mjs" }),
        stageOutput: async () => ({ cleanup, directory: "/isolated/.output" }),
        targets: [target],
        timeoutMs: 500,
      }),
    ).rejects.toThrow("probe timed out");
    expect(deps.runCommand.mock.calls[0]?.[1]).toHaveProperty("timeoutMs", 500);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "retired executor preset",
      { preset: "node-server", serverEntry: "server.mjs" },
      "Example Nitro output uses node-server instead of bun",
    ],
    [
      "outside output",
      { preset: "bun", serverEntry: "../../secret.mjs" },
      "points outside its output directory",
    ],
  ] as const)("rejects unsafe Nitro output: %s", async (_name, metadata, message) => {
    const deps = dependencies();
    await expect(
      verifyNitroRuntimes(deps, {
        allocatePort: async () => 43210,
        readMetadata: async () => JSON.stringify(metadata),
        targets: [target],
      }),
    ).rejects.toThrow(message);
    expect(deps.runCommand).not.toHaveBeenCalled();
  });
});
