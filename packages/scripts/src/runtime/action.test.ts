import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { runCliAction } from "./action.js";
import { ProcessError } from "./process.js";

const originalExitCode = process.exitCode;
const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnvironment;
});

describe("runCliAction", { concurrent: false }, () => {
  it.each(["invalid environment", "throwing logger"])(
    "falls back to safe stderr: %s",
    async (failure) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      if (failure === "invalid environment") process.env.NODE_ENV = "invalid-for-scripts-schema";
      await runCliAction("example", async ({ setLogger }) => {
        if (failure === "throwing logger")
          setLogger(() => {
            throw new Error("logger failure");
          });
        throw new Error("expected failure");
      });
      expect(consoleError).toHaveBeenCalledWith("vmx example failed: expected failure");
      expect(process.exitCode).toBe(1);
    },
  );

  it("preserves a child process exit code", async () => {
    const log = vi.fn();

    await runCliAction("example", async ({ setLogger }) => {
      setLogger(log);
      throw new ProcessError("child failed", ["child"], 7, null);
    });

    expect(log).toHaveBeenCalledWith("error", "command.failed", {
      command: "example",
      message: "child failed",
    });
    expect(process.exitCode).toBe(7);
  });

  it("re-emits a child process termination signal", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as typeof process.kill);

    await runCliAction("example", async () => {
      throw new ProcessError("child terminated", ["child"], null, "SIGTERM");
    });

    expect(kill).toHaveBeenCalledWith(process.pid, "SIGTERM");
    expect(process.exitCode).toBe(originalExitCode);
  });
});
