import { processDependencies } from "../test-fixtures.js";
import { describe, expect, it, vi } from "vite-plus/test";

import { runAudit, runDedupe } from "./operations.js";

describe("dependency maintenance", () => {
  it.each([
    ["dedupe", runDedupe, ["bun", "dedupe"], [{ check: false }]],
    ["audit", runAudit, ["bun", "audit"], []],
    [
      "dedupe check",
      (deps: ReturnType<typeof processDependencies>) => runDedupe(deps, { check: true }),
      ["bun", "dedupe", "--check"],
      [{ check: true }],
    ],
  ] as const)("runs %s with the repository environment", async (name, run, command, data) => {
    const deps = processDependencies();
    await run(deps);
    expect(deps.runCommand).toHaveBeenCalledWith(command, {
      cwd: "/repo",
      env: deps.processEnv,
    });
    const event = name === "audit" ? "audit" : "dedupe";
    expect(deps.log).toHaveBeenNthCalledWith(1, "info", `deps.${event}.started`, ...data);
    expect(deps.log).toHaveBeenNthCalledWith(2, "info", `deps.${event}.completed`, ...data);
  });

  it("does not log completion when Bun fails", async () => {
    const deps = processDependencies();
    const { log } = deps;
    deps.runCommand = vi.fn(async () => {
      throw new Error("bun failed");
    });

    await expect(runAudit(deps)).rejects.toThrow("bun failed");
    expect(log).toHaveBeenCalledTimes(1);
  });
});
