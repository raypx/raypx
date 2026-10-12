import { describe, expect, it } from "vite-plus/test";
import { browserInvocation, browserSelection } from "./selection.js";
import { runE2e } from "./operation.js";
import { processDependencies } from "../test-fixtures.js";

describe("focused browser runs", () => {
  it("keeps a bare invocation as the complete browser gate", () => {
    expect(browserInvocation(browserSelection([]))).toEqual([
      "rpx",
      "tasks",
      "e2e",
      "--filter",
      "@raypx/e2e",
    ]);
  });

  it("forwards file, title, worker and shard filters only to Playwright", () => {
    const args = [
      "tests/cloud.spec.ts",
      "--grep",
      "delivery acceptance",
      "--workers=2",
      "--shard=1/2",
    ];
    const selection = browserSelection(["web", "--group=cloud", "--", ...args]);
    expect(selection).toEqual({
      suite: "web",
      group: "cloud",
      playwrightArgs: args,
      listOnly: false,
    });
    expect(browserInvocation(selection)).toEqual([
      "rpx",
      "tasks",
      "e2e:web",
      "--filter",
      "@raypx/e2e",
      "--",
      ...args,
    ]);
  });

  it.each(["--list", "--help"])("bypasses builds for the read-only %s command", (flag) => {
    expect(browserInvocation(browserSelection(["desktop", flag]))).toEqual([
      "bun",
      "run",
      "--cwd",
      "e2e",
      "e2e:desktop",
      flag,
    ]);
  });

  it("accepts Bun's script separator before the application selection", () => {
    expect(browserSelection(["--", "web", "--group", "projects", "--list"])).toEqual({
      suite: "web",
      group: "projects",
      playwrightArgs: ["--list"],
      listOnly: true,
    });
  });

  it.each([
    { args: ["--group"] },
    { args: ["--group="] },
    { args: ["--group", "--list"] },
    { args: ["--group=smoke", "--group=cloud"] },
  ])("rejects missing or ambiguous groups $args", ({ args }) =>
    expect(() => browserSelection(args)).toThrow(),
  );

  it("passes the group through Turbo's E2E environment without mutating its parent", async () => {
    const deps = {
      ...processDependencies(),
      processEnv: { NODE_ENV: "test", RAYPX_E2E_GROUP: "smoke" },
    };
    await runE2e(deps, ["web", "--group", "cloud", "--list"]);
    expect(deps.runCommand).toHaveBeenCalledWith(
      ["bun", "run", "--cwd", "e2e", "e2e:web", "--list"],
      { cwd: "/repo", env: { NODE_ENV: "test", RAYPX_E2E_GROUP: "cloud" } },
    );
    expect(deps.processEnv.RAYPX_E2E_GROUP).toBe("smoke");
  });

  it("clears inherited focused selection for a full run", async () => {
    const deps = {
      ...processDependencies(),
      processEnv: { NODE_ENV: "test", RAYPX_E2E_GROUP: "cloud" },
    };
    await runE2e(deps, []);
    expect(deps.runCommand).toHaveBeenCalledWith(
      ["rpx", "tasks", "e2e", "--filter", "@raypx/e2e"],
      { cwd: "/repo", env: { NODE_ENV: "test" } },
    );
  });
});
