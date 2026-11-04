import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checked, execute, pass, project } from "../helpers/cache.js";

it.each([true, false])(
  "tracks dependency typecheck configuration (automatic inputs: %s)",
  (automaticInputs) => {
    const root = project(automaticInputs);
    const tokens = checked(root, "tokens");
    checked(root, "consumer", { "@raypx/tokens": "workspace:*" });
    const selector = "@raypx/consumer#task:check";
    pass(execute(root, "check", {}, selector));
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
    const config = join(tokens, "tsconfig.json");
    writeFileSync(config, readFileSync(config, "utf8") + "\n");
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache miss");
  },
  60000,
);
