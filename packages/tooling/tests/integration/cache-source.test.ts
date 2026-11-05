import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checked, execute, pass, project } from "../helpers/cache.ts";

it.each([true, false])(
  "tracks authored coverage source (automatic inputs: %s)",
  (automaticInputs) => {
    const root = project(automaticInputs);
    const tokens = checked(root, "tokens");
    checked(root, "consumer", { "@raypx/tokens": "workspace:*" });
    const selector = "@raypx/consumer#task:check";
    pass(execute(root, "check", {}, selector));
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
    // A source folder named coverage is authored input, not a workspace report directory.
    mkdirSync(join(tokens, "src/coverage"));
    writeFileSync(join(tokens, "src/coverage/value.ts"), "export const value = 1;");
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache miss");
  },
  60000,
);
