import { processDependencies } from "../test-fixtures.js";
import { describe, expect, it, vi } from "vite-plus/test";

import { runClean } from "./clean.js";
import { runDesktopBuild } from "./desktop.js";
import { runGenerate } from "./generate.js";
import { runVerify } from "./verify.js";

function dependencies() {
  return {
    ...processDependencies(),
    verifyI18n: vi.fn(async () => undefined),
    verifyPolicy: vi.fn(async () => undefined),
    verifyRuntimes: vi.fn(async (_options: { captureOutput: boolean }) => undefined),
  };
}

describe("repository workflows", () => {
  it("clears the Bun cache before removing optional repository dependencies", async () => {
    const deps = {
      ...dependencies(),
      cleanRepository: vi.fn(async () => ["node_modules"]),
    };

    await runClean(deps, { bunCache: true, dependencies: true });

    expect(deps.runCommand).toHaveBeenCalledWith(["bun", "pm", "cache", "rm"], {
      cwd: "/repo",
      env: deps.processEnv,
    });
    expect(deps.cleanRepository).toHaveBeenCalledWith("/repo", { dependencies: true });
    expect(deps.log).toHaveBeenLastCalledWith("info", "clean.completed", {
      bunCache: true,
      dependencies: true,
      removed: ["node_modules"],
      removedCount: 1,
    });
  });

  it.each([
    ["default", []],
    ["extra Drizzle flags", ["--hints", "[]"]],
  ])("generates database artifacts with %s", async (_name, flags) => {
    const deps = dependencies();
    await runGenerate(deps, flags);
    expect(deps.runCommand.mock.calls.map(([command]) => command)).toEqual([
      ["bun", "run", "--cwd", "packages/db", "generate", ...flags],
    ]);
  });

  it("does not regenerate route trees, which the Start plugin owns", async () => {
    const deps = dependencies();

    await runGenerate(deps);

    const commands = deps.runCommand.mock.calls.map(([command]) => command.join(" "));
    expect(commands.some((command) => command.includes("generate-routes"))).toBe(false);
  });

  it("builds Desktop with the repository environment", async () => {
    const deps = dependencies();

    await runDesktopBuild(deps);

    expect(deps.runCommand).toHaveBeenCalledWith(
      ["bun", "run", "--cwd", "apps/desktop", "tauri", "build"],
      { cwd: "/repo", env: { ...deps.processEnv, CI: "true" } },
    );
  });

  // This sequence is the definition of "everything is checked". A gate missing
  // from it is a gate a contributor who runs only `bun run verify` never meets,
  // which is why it is asserted whole rather than by membership.
  it.each([false, true])("runs every gate cheapest first (verbose=%s)", async (verbose) => {
    const deps = dependencies();
    await runVerify(deps, { verbose });

    expect(deps.verifyI18n).toHaveBeenCalledOnce();

    expect(deps.runCommand.mock.calls.map(([command]) => command)).toEqual([
      ["vmx", "tasks", "format:leaf"],
      ["vmx", "tasks", "lint:leaf"],
      ["vmx", "tasks", "check"],
      ["vmx", "tasks", "test:unit", "test:component", "--filter", "!@voidmix/e2e"],
      ["vmx", "tasks", "test:integration", "--filter", "!@voidmix/e2e"],
      ["vmx", "tasks", "build"],
      ["node", "apps/worker/dist/index.mjs", "--check"],
    ]);
    expect(deps.runCommand.mock.calls.map(([, options]) => options.env)).toEqual(
      Array(7).fill(deps.processEnv),
    );
    expect(deps.runCommand.mock.calls.map(([, options]) => options.captureOutput)).toEqual(
      Array(7).fill(!verbose),
    );
    expect(deps.verifyRuntimes).toHaveBeenCalledWith({ captureOutput: !verbose });
  });

  it("checks formatting before spending minutes on a build", async () => {
    const deps = dependencies();
    deps.runCommand = vi.fn(async (command: readonly string[]) => {
      if (command.includes("format:leaf")) throw new Error("Format issues found");
    });

    await expect(runVerify(deps)).rejects.toThrow("Format issues found");
    expect(deps.runCommand.mock.calls.map(([command]) => command)).toEqual([
      ["vmx", "tasks", "format:leaf"],
    ]);
    expect(deps.verifyRuntimes).not.toHaveBeenCalled();
  });

  it.each([
    ["verifyPolicy", "Policy: 1 errors, 0 warnings."],
    ["verifyI18n", "i18n: 1 errors, 0 warnings."],
  ] as const)("stops at %s before any later gate", async (gate, message) => {
    const deps = dependencies();
    deps[gate].mockRejectedValue(new Error(message));
    await expect(runVerify(deps)).rejects.toThrow(message);
    if (gate === "verifyI18n") expect(deps.verifyPolicy).not.toHaveBeenCalled();
    expect(deps.runCommand).not.toHaveBeenCalled();
    expect(deps.verifyRuntimes).not.toHaveBeenCalled();
  });
});
