import { expect, it } from "vite-plus/test";
import { comparisonEnvironment, performanceEnvironment } from "./environment.js";

it("measures head on both A/A roles and retains distinct A/B artifacts", () => {
  const env = { RAYPX_STROBE_CLI_BASE: "/base/raypx", RAYPX_STROBE_CLI_HEAD: "/head/raypx" };
  expect(comparisonEnvironment(env, "aa").RAYPX_STROBE_CLI_BASE).toBe("/head/raypx");
  expect(comparisonEnvironment(env, "ab").RAYPX_STROBE_CLI_BASE).toBe("/base/raypx");
  expect(env.RAYPX_STROBE_CLI_BASE).toBe("/base/raypx");
});

it("removes credentials and inherited Raypx overrides while preserving process ownership", () => {
  const env = performanceEnvironment({
    OPENAI_API_KEY: "synthetic",
    RAYPX_HOME: "/user/profile",
    STROBE_OWNER: "owned",
    STROBE_HOME: "/isolated",
    PATH: "/tools",
  });
  expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.RAYPX_HOME).toBeUndefined();
  expect(env.STROBE_OWNER).toBe("owned");
  expect(env.STROBE_HOME).toBe("/isolated");
  expect(env.PATH).toBe("/tools");
});
