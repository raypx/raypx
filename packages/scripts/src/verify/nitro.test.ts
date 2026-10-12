import { describe, expect, it, vi } from "vite-plus/test";

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
    runCommand: vi.fn(
      async (_command: readonly string[], _options: { cwd: string; env: NodeJS.ProcessEnv }) =>
        undefined,
    ),
  };
}

describe("verifyNitroRuntimes", () => {
  it("checks node-server metadata and starts the output with Node", async () => {
    const deps = dependencies();
    const cleanup = vi.fn(async () => undefined);

    await verifyNitroRuntimes(deps, {
      allocatePort: async () => 43210,
      readMetadata: async () =>
        JSON.stringify({ preset: "node-server", serverEntry: "server/index.mjs" }),
      stageOutput: async () => ({ cleanup, directory: "/isolated/.output" }),
      targets: [target],
    });

    expect(deps.runCommand).toHaveBeenCalledOnce();
    const [command, options] = deps.runCommand.mock.calls[0] ?? [];
    expect(command?.slice(0, 4)).toEqual([
      "node",
      "--input-type=module",
      "--eval",
      expect.any(String),
    ]);
    expect(command?.slice(4)).toEqual([
      "file:///isolated/.output/server/index.mjs",
      "Example",
      JSON.stringify(target.probes),
    ]);
    expect(options).toEqual({
      captureOutput: false,
      cwd: "/isolated/.output",
      env: expect.objectContaining({
        ALLOWED_ORIGINS: "http://localhost:3000",
        DATABASE_URL: "postgres://voidmix:verify@example.invalid:5432/voidmix",
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
      "postgres://voidmix:verify@example.invalid:5432/voidmix",
    );
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "non-Node preset",
      { preset: "bun", serverEntry: "server.mjs" },
      "Example Nitro output uses bun instead of node-server",
    ],
    [
      "outside output",
      { preset: "node-server", serverEntry: "../../secret.mjs" },
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
