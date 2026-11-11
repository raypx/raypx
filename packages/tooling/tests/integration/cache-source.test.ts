import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

it("tracks private verification only when the Tooling export graph can reach it", () => {
  const root = project(false);
  checked(root, "consumer", { "@raypx/tooling": "workspace:*" });
  const tooling = join(root, "packages/tooling");
  const manifest = join(tooling, "package.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      ...JSON.parse(readFileSync(manifest, "utf8")),
      exports: { "./shared": "./src/shared.ts" },
    }),
  );
  const shared = join(tooling, "src/shared.ts");
  const privateFile = join(tooling, "src/verification/gates.ts");
  mkdirSync(join(tooling, "src/verification"));
  writeFileSync(shared, "export const value = 1;");
  writeFileSync(privateFile, "export const gate = 1;");

  const run = () => pass(execute(root, "check", {}, "@raypx/consumer#task:check")).log;
  expect(run()).toContain("cache miss");
  writeFileSync(privateFile, "export const gate = 2;");
  expect(run()).toContain("cache hit");
  writeFileSync(shared, "export const value = 2;");
  expect(run()).toContain("cache miss");

  writeFileSync(shared, 'export { gate } from "./verification/gates.js";');
  expect(run()).toContain("cache miss");
  writeFileSync(privateFile, "export const gate = 3;");
  expect(run()).toContain("cache miss");

  writeFileSync(shared, 'export { gate } from "./unresolved.js";');
  expect(run()).toContain("cache miss");
  writeFileSync(privateFile, "export const gate = 4;");
  expect(run()).toContain("cache miss");
}, 60000);
