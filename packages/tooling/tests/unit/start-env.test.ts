import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { workspaceFixtures } from "../helpers/workspace.js";
import { startEnvironment } from "../../src/build/start-env.js";
const { fixture } = workspaceFixtures();
afterEach(() => vi.unstubAllEnvs());
it("retains inherited variables and dotenv keys without tracking the entire tool environment", () => {
  const root = fixture();
  writeFileSync(join(root, ".env"), "APP_SETTING=fixture\nVITE_TITLE=fixture\n");
  writeFileSync(join(root, ".env.production.local"), "MODE_SETTING=fixture\n");
  vi.stubEnv("CODEX_TOOL_CALL_ID", "fixture-inherited");
  const queries: string[][] = [];
  const plugin = {
    name: "tanstack-start-core:load-env",
    configResolved: (_config: { root: string; mode: string }) => {
      throw new Error("Unscoped loader ran");
    },
  };
  startEnvironment([false, [plugin]], (mode, directory, prefixes) => {
    expect(mode).toBe("production");
    expect(directory).toBe(root);
    queries.push(prefixes);
    return {};
  });
  plugin.configResolved({ root, mode: "production" });
  expect(queries[0]).toEqual(expect.arrayContaining(["VITE_", "APP_SETTING", "MODE_SETTING"]));
  expect(queries[0]).not.toContain("");
  expect(queries[0]).not.toContain("CODEX_TOOL_CALL_ID");
  expect(process.env.CODEX_TOOL_CALL_ID).toBe("fixture-inherited");
});
it("requires review when Start changes its environment plugin interface", () => {
  expect(() => startEnvironment([{ name: "unexpected-loader" }], () => ({}))).toThrow(
    "TanStack Start environment plugin changed",
  );
});
