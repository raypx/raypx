import { expect, it } from "vite-plus/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";
import { checkKnip, knipFindings } from "./knip.ts";

it("preserves native pnpm catalog and override findings without modifying the report", () => {
  const report = {
    issues: [{ file: "pnpm-workspace.yaml", catalog: [{ namespace: "dev", name: "unused" }] }],
  };
  const before = JSON.stringify(report);
  expect(knipFindings(report)).toEqual(report.issues);
  expect(JSON.stringify(report)).toBe(before);
});

it("rejects malformed reports and preserves malformed catalog findings", () => {
  for (const report of [null, {}, { issues: [null] }, { issues: [{ file: "x", exports: false }] }])
    expect(() => knipFindings(report)).toThrow("Invalid Knip");
  const report = { issues: [{ file: "package.json", catalog: [{ name: "x" }] }] };
  expect(knipFindings(report)).toEqual(report.issues);
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
