import { rejects } from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "bun:test";
import { collectInventory } from "../../src/validation/inventory.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture, member } = workspaceFixtures();
function write(root: string, path: string, value: unknown) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), JSON.stringify(value));
}
function report(root: string, directory: string, filename: string, files: string[]) {
  write(root, `${directory}/node_modules/.cache/raypx-tests/${filename}`, {
    success: true,
    numFailedTests: 0,
    numPendingTests: 0,
    numPassedTests: files.length,
    testResults: files.map((file) => ({
      name: join(root, directory, file),
      assertionResults: [{ fullName: file, status: "passed", duration: 2 }],
    })),
  });
}
function setup() {
  const root = fixture();
  const directory = member(root, "feature", {
    extra: { scripts: { test: "fixture", "test:unit": "fixture", "test:component": "fixture" } },
  });
  const files = ["src/model.test.ts", "src/view.component.test.tsx"];
  for (const file of [
    ...files,
    "tests/postgres/node/storage.test.ts",
    "tests/redis/cache.test.ts",
    "tests/cluster/relay.test.ts",
  ])
    write(root, `${directory}/${file}`, "fixture");
  const browser = member(root, "browser", {
    metadata: { kind: "tooling", target: "bun" },
    extra: { scripts: { e2e: "fixture" } },
  });
  write(root, `${browser}/tests/access.spec.ts`, "fixture");
  return { root, directory, files };
}

it("reconciles default and focused reports against actual files without including explicit database/browser gates", async () => {
  const { root, directory, files } = setup();
  report(root, directory, "all.json", files);
  report(root, directory, "audit-unit.json", [files[0]!]);
  report(root, directory, "audit-component.json", [files[1]!]);
  const full = await collectInventory(root, ["all.json"]);
  const layers = await collectInventory(root, [
    "audit-unit.json",
    "audit-component.json",
    "audit-integration.json",
  ]);
  expect(layers.cases).toEqual(full.cases);
  expect(full.files).toHaveLength(2);
  expect(full.sources.filter((source) => source.layer === "external")).toHaveLength(4);
});

it("rejects missing, stale, duplicate and failed reports rather than reporting incomplete coverage as passed", async () => {
  const { root, directory, files } = setup();
  await rejects(collectInventory(root, ["all.json"]), /Missing report/);
  report(root, directory, "all.json", [files[0]!]);
  await rejects(collectInventory(root, ["all.json"]), /incomplete/);
  report(root, directory, "all.json", ["tests/removed.test.ts"]);
  await rejects(collectInventory(root, ["all.json"]), /Unexpected ordinary test file/);
  report(root, directory, "all.json", [files[0]!, ...files]);
  await rejects(collectInventory(root, ["all.json"]), /more than once/);
  write(root, `${directory}/node_modules/.cache/raypx-tests/all.json`, { success: false });
  await rejects(collectInventory(root, ["all.json"]), /Incomplete or failed/);
});

it("combines Bun JUnit and Vitest JSON without losing nested case names", async () => {
  const { root, directory, files } = setup();
  report(root, directory, "all.json", files);
  const bun = member(root, "bun-suite", { extra: { scripts: { test: "bun test" } } });
  const file = "src/state.test.ts";
  write(root, `${bun}/${file}`, "fixture");
  const xml = join(root, bun, "node_modules/.cache/raypx-tests/all.xml");
  mkdirSync(dirname(xml), { recursive: true });
  const contents = `<testsuites name="bun test" tests="1" failures="0" skipped="0">
    <testsuite file="${file}">
      <testsuite name="outer"><testsuite name="inner &amp; friends">
        <testcase file="${file}" name="checks &lt;state&gt;" time="0.003"/>
      </testsuite></testsuite>
    </testsuite>
  </testsuites>`;
  writeFileSync(xml, contents);
  const inventory = await collectInventory(root, ["all.json"]);
  expect(inventory.files).toHaveLength(3);
  expect(inventory.cases.find((test) => test.workspace === "@raypx/bun-suite")).toEqual({
    workspace: "@raypx/bun-suite",
    file: `${bun}/${file}`,
    name: "outer inner & friends checks <state>",
    status: "passed",
    durationMs: 3,
  });
  writeFileSync(xml, contents.replace('skipped="0"', 'skipped="1"'));
  await rejects(collectInventory(root, ["all.json"]), /Incomplete or failed/);
});
