import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { argumentKey } from "../../src/tasks/arguments.ts";
import { checked, execute, pass, project } from "../helpers/cache.ts";

it("runs a delegated package runner once with literal arguments scoped to the public task", () => {
  const root = project();
  const directory = checked(
    root,
    "feature",
    {},
    { test: "tsx missing-public-entry.ts", _test: "tsx runner.ts" },
  );
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  manifest.raypx.taskScripts = { test: "_test" };
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  writeFileSync(
    join(directory, "runner.ts"),
    'import {appendFileSync} from "node:fs"; appendFileSync("calls.jsonl", JSON.stringify(process.argv.slice(2))+"\\n");',
  );
  const argv = ["two words", "literal-$VALUE", "--reporter=json"];
  pass(
    execute(
      root,
      "test",
      { [argumentKey("@raypx/feature#test")]: JSON.stringify(argv) },
      "@raypx/feature#task:test",
    ),
  );
  const calls = readFileSync(join(directory, "calls.jsonl"), "utf8").trim().split("\n");
  expect(calls.map((line) => JSON.parse(line))).toEqual([argv]);
}, 30000);
