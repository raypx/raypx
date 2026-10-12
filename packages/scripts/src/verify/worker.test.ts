import { describe, expect, it, vi } from "vite-plus/test";
import { processDependencies } from "../test-fixtures.js";
import { verifyWorkerRuntime } from "./worker.js";

const readMetadata = async () => JSON.stringify({ preset: "bun", serverEntry: "server/index.mjs" });

describe("verifyWorkerRuntime", () => {
  it("runs the isolated Nitro entry with production mode and a bounded deadline", async () => {
    const dependencies = processDependencies();
    const cleanup = vi.fn(async () => undefined);
    await verifyWorkerRuntime(dependencies, {
      readMetadata,
      stageOutput: async () => ({ cleanup, directory: "/isolated/.output" }),
      captureOutput: true,
    });
    expect(dependencies.runCommand).toHaveBeenCalledWith(
      ["bun", "--no-env-file", "--no-install", "/isolated/.output/server/index.mjs", "--check"],
      {
        captureOutput: true,
        cwd: "/isolated/.output",
        env: { ...dependencies.processEnv, NODE_ENV: "production" },
        timeoutMs: 60_000,
      },
    );
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans after the child rejects and preserves the failure", async () => {
    const dependencies = processDependencies();
    const failure = new Error("Worker probe timed out");
    const cleanup = vi.fn(async () => undefined);
    dependencies.runCommand.mockRejectedValue(failure);
    await expect(
      verifyWorkerRuntime(dependencies, {
        readMetadata,
        stageOutput: async () => ({ cleanup, directory: "/isolated/.output" }),
        timeoutMs: 500,
      }),
    ).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(dependencies.runCommand.mock.calls[0]?.[1]).toHaveProperty("timeoutMs", 500);
  });

  it("stops on staging failure before starting a child", async () => {
    const dependencies = processDependencies();
    await expect(
      verifyWorkerRuntime(dependencies, {
        readMetadata,
        stageOutput: async () => {
          throw new Error("copy failed");
        },
      }),
    ).rejects.toThrow("copy failed");
    expect(dependencies.runCommand).not.toHaveBeenCalled();
  });
});
