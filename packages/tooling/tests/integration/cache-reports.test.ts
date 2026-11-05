import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checked, execute, pass, project } from "../helpers/cache.ts";

for (const automaticInputs of [true, false]) {
  it.each(["coverage", ".artifacts", "test-results", "playwright-report"])(
    `ignores dependency %s creation, changes and deletion (automatic inputs: ${automaticInputs})`,
    (directory) => {
      const root = project(automaticInputs);
      const tokens = checked(root, "tokens");
      checked(root, "consumer", { "@raypx/tokens": "workspace:*" });
      const selector = "@raypx/consumer#task:check";
      pass(execute(root, "check", {}, selector));
      expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
      mkdirSync(join(tokens, directory), { recursive: true });
      const report = join(tokens, directory, "result.json");
      writeFileSync(report, "{}");
      expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
      writeFileSync(report, '{"changed":true}');
      expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
      rmSync(join(tokens, directory), { recursive: true });
      expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
    },
    60000,
  );
}
