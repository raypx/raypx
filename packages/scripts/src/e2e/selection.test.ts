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
      "--only",
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
      "--only",
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
      {
        cwd: "/repo",
        env: { NODE_ENV: "test", RAYPX_E2E_GROUP: "cloud", VITE_API_URL: "http://127.0.0.1:3002" },
      },
    );
    expect(deps.processEnv.RAYPX_E2E_GROUP).toBe("smoke");
  });

  it("clears inherited focused selection for a full run", async () => {
    const deps = {
      ...processDependencies(),
      processEnv: { NODE_ENV: "test", RAYPX_E2E_GROUP: "cloud" },
    };
    await runE2e(deps, []);
    expect(deps.runCommand).toHaveBeenNthCalledWith(
      1,
      ["rpx", "tasks", "build", "--filter", "api", "--filter", "web", "--filter", "desktop"],
      { cwd: "/repo", env: { NODE_ENV: "production", VITE_API_URL: "http://127.0.0.1:3002" } },
    );
    expect(deps.runCommand).toHaveBeenNthCalledWith(
      2,
      ["rpx", "tasks", "e2e", "--filter", "@raypx/e2e", "--only"],
      { cwd: "/repo", env: { NODE_ENV: "test", VITE_API_URL: "http://127.0.0.1:3002" } },
    );
  });

  it("binds the browser build to the selected test API before invoking Turbo", async () => {
    const deps = {
      ...processDependencies(),
      processEnv: {
        NODE_ENV: "test",
        RAYPX_E2E_PORT: "43210",
        VITE_API_URL: "https://unrelated.example.test",
      },
    };
    await runE2e(deps, ["web", "--group=smoke"]);
    expect(deps.runCommand).toHaveBeenNthCalledWith(
      1,
      ["rpx", "tasks", "build", "--filter", "api", "--filter", "web"],
      {
        cwd: "/repo",
        env: {
          NODE_ENV: "production",
          RAYPX_E2E_PORT: "43210",
          VITE_API_URL: "http://127.0.0.1:43212",
          RAYPX_E2E_GROUP: "smoke",
        },
      },
    );
    expect(deps.runCommand).toHaveBeenNthCalledWith(
      2,
      ["rpx", "tasks", "e2e:web", "--filter", "@raypx/e2e", "--only"],
      {
        cwd: "/repo",
        env: {
          NODE_ENV: "test",
          RAYPX_E2E_PORT: "43210",
          VITE_API_URL: "http://127.0.0.1:43212",
          RAYPX_E2E_GROUP: "smoke",
        },
      },
    );
    expect(deps.processEnv.VITE_API_URL).toBe("https://unrelated.example.test");
  });

  it("builds only API and Desktop before the focused Desktop driver", async () => {
    const deps = { ...processDependencies(), processEnv: { NODE_ENV: "test" } };
    await runE2e(deps, ["desktop", "--grep", "layouts"]);
    expect(deps.runCommand.mock.calls.map(([command]) => command)).toEqual([
      ["rpx", "tasks", "build", "--filter", "api", "--filter", "desktop"],
      [
        "rpx",
        "tasks",
        "e2e:desktop",
        "--filter",
        "@raypx/e2e",
        "--only",
        "--",
        "--grep",
        "layouts",
      ],
    ]);
    expect(deps.runCommand.mock.calls.map(([, { env }]) => env.NODE_ENV)).toEqual([
      "production",
      "test",
    ]);
  });

  it("does not start the browser driver when its production build fails", async () => {
    const deps = { ...processDependencies(), processEnv: { NODE_ENV: "test" } };
    deps.runCommand.mockRejectedValue(new Error("Build failed"));
    await expect(runE2e(deps, ["web"])).rejects.toThrow("Build failed");
    expect(deps.runCommand).toHaveBeenCalledOnce();
  });

  it.each(["0", "65534", "NaN", "3.5", "-1"])(
    "rejects invalid port ranges %s before builds",
    async (port) => {
      const deps = { ...processDependencies(), processEnv: { RAYPX_E2E_PORT: port } };
      await expect(runE2e(deps, ["web"])).rejects.toThrow("three valid consecutive ports");
      expect(deps.runCommand).not.toHaveBeenCalled();
    },
  );
});
