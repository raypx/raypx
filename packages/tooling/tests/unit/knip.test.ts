import { expect, it } from "vite-plus/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceFixtures } from "../helpers/workspace.js";
import { checkKnip, knipFindings } from "../../src/validation/knip.js";

it("keeps unused catalog entries and all other findings while recognizing Bun override references", () => {
  const report = {
    issues: [
      {
        file: "package.json",
        catalog: [
          { namespace: "dev", name: "esbuild" },
          { namespace: "dev", name: "unused" },
          { namespace: "", name: "renderer" },
          { namespace: "dev", name: "missing" },
        ],
        devDependencies: [{ name: "unused-cli" }],
      },
      { file: "apps/child/package.json", catalog: [{ namespace: "dev", name: "esbuild" }] },
    ],
  };
  const before = JSON.stringify(report);
  expect(
    knipFindings(report, {
      overrides: { esbuild: "catalog:dev", renderer: "catalog:", missing: "catalog:dev" },
      workspaces: { catalog: { renderer: "^2.2.0" }, catalogs: { dev: { esbuild: "^0.28.2" } } },
    }),
  ).toEqual([
    {
      file: "package.json",
      catalog: [
        { namespace: "dev", name: "unused" },
        { namespace: "dev", name: "missing" },
      ],
      devDependencies: [{ name: "unused-cli" }],
    },
    report.issues[1],
  ]);
  expect(JSON.stringify(report)).toBe(before);
});

it("rejects malformed reports and preserves malformed catalog findings", () => {
  for (const report of [null, {}, { issues: [null] }, { issues: [{ file: "x", exports: false }] }])
    expect(() => knipFindings(report, {})).toThrow("Invalid Knip");
  const report = { issues: [{ file: "package.json", catalog: [{ name: "x" }] }] };
  expect(knipFindings(report, {})).toEqual(report.issues);
});

const { fixture } = workspaceFixtures();
it("does not accept crashed, empty-failure or malformed Knip results", () => {
  const root = fixture();
  const directory = join(root, "node_modules/knip/bin");
  mkdirSync(directory, { recursive: true });
  for (const [source, message] of [
    ["console.log(JSON.stringify({ issues: [] })); process.exit(1)", "without reported findings"],
    ['console.error("config failed"); process.exit(2)', "Knip failed (2)"],
    ['console.log("invalid JSON"); process.exit(1)', "JSON"],
  ]) {
    writeFileSync(join(directory, "knip.js"), source!);
    expect(() => checkKnip(root)).toThrow(message!);
  }
});
