import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { argumentKey } from "../../src/tasks/arguments.js";
import { checked, execute, pass, project } from "../helpers/cache.js";

const repository = resolve(import.meta.dirname, "../../../..");
const vp = join(repository, "node_modules/vite-plus/bin/vp");

it("restores cached build outputs and scopes literal argv and public build environment", () => {
  const root = project();
  const folder = checked(root, "feature", {}, { build: "bun build.ts" });
  writeFileSync(
    join(folder, "build.ts"),
    'import { mkdirSync, writeFileSync } from "node:fs"; mkdirSync("dist",{recursive:true}); writeFileSync("dist/value.json",JSON.stringify([process.env.VITE_EXAMPLE,...process.argv.slice(2)]));',
  );
  const selector = "@raypx/feature#task:build";
  const first = execute(root, "build", { VITE_EXAMPLE: "one" }, selector);
  pass(first);
  const file = join(folder, "dist/value.json");
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["one"]);
  rmSync(join(folder, "dist"), { recursive: true });
  const warm = execute(root, "build", { VITE_EXAMPLE: "one" }, selector);
  expect(warm.code).toBe(0);
  expect(warm.log).toContain("2 cache hits");
  expect(existsSync(file)).toBe(true);
  const literal = "a path with spaces $(never-run) `literal`";
  const changed = execute(
    root,
    "build",
    {
      VITE_EXAMPLE: "two",
      [argumentKey("@raypx/feature#build")]: JSON.stringify([literal]),
    },
    selector,
  );
  expect(changed.code).toBe(0);
  expect(changed.log).toContain("1 cache hit");
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["two", literal]);
}, 30000);

it("invalidates CLI builds when the cross-workspace packaging hook changes", () => {
  const root = project();
  const hook = join(root, "packages/tooling/src/build/cli.ts");
  mkdirSync(join(root, "packages/tooling/src/build"), { recursive: true });
  writeFileSync(hook, "export const version = 1;\n");
  const folder = checked(root, "cli", {}, { build: "bun build.ts" });
  const manifestPath = join(folder, "package.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, "utf8")), name: "cli" }),
  );
  writeFileSync(
    join(folder, "build.ts"),
    `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
mkdirSync("dist", { recursive: true });
writeFileSync("dist/package-hook.txt", readFileSync("../../packages/tooling/src/build/cli.ts"));\n`,
  );
  const selector = "cli#task:build";
  pass(execute(root, "build", {}, selector));
  expect(pass(execute(root, "build", {}, selector)).log).toContain("2 cache hits");

  writeFileSync(hook, "export const version = 2;\n");
  const changed = pass(execute(root, "build", {}, selector));
  expect(changed.log).toContain("1 cache hit");
  expect(readFileSync(join(folder, "dist/package-hook.txt"), "utf8")).toContain("version = 2");
}, 30000);

it("reuses VP pack results after validation writes ignored artifacts", () => {
  const root = project();
  const folder = checked(
    root,
    "cli-fixture",
    {},
    { build: `bun --bun ${JSON.stringify(vp)} pack` },
  );
  const config = join(folder, "vite.config.ts");
  writeFileSync(
    config,
    readFileSync(config, "utf8").replace(
      "export default config;",
      'export default {...config, envPrefix: [], pack: {entry: ["src/index.ts"], dts: false}};',
    ),
  );
  const selector = "@raypx/cli-fixture#task:build";
  pass(execute(root, "build", {}, selector));
  expect(pass(execute(root, "build", {}, selector)).log).toContain("2 cache hits");
  mkdirSync(join(root, ".artifacts/validation"), { recursive: true });
  writeFileSync(join(root, ".artifacts/validation/result.json"), "fixture");
  expect(pass(execute(root, "build", {}, selector)).log).toContain("2 cache hits");
}, 30000);
