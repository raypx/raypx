import { expectOnlyFinding } from "../test-fixtures.js";
import { describe, expect, it } from "vite-plus/test";

import {
  fixWorkspaceTypeScriptConfig,
  isPresetFile,
  validateWorkspaceTypeScriptConfig,
} from "./tsconfig.js";

function presetFiles(files: Record<string, object | string>) {
  return new Map(
    Object.entries(files).map(([name, value]) => [
      `packages/tsconfig/${name}.json`,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
}
const presets = presetFiles({
  base: { compilerOptions: { strict: true, noEmit: true, types: [] } },
  node: { extends: "./base.json", compilerOptions: { module: "NodeNext", types: ["node"] } },
  browser: { extends: "./base.json", compilerOptions: { allowImportingTsExtensions: true } },
});

const location = "packages/example/tsconfig.json";

function config(body: Record<string, unknown>): string {
  return JSON.stringify(body);
}

describe("validateWorkspaceTypeScriptConfig", () => {
  it.each<{
    name: string;
    content: string;
    expected: object;
  }>([
    {
      name: "reports a config that inherits nothing",
      content: config({ compilerOptions: { strict: true } }),
      expected: {
        check: "tsconfig.preset",
        location,
        message: "declares no extends, so it inherits none of the shared compiler options",
        severity: "error",
      },
    },
    {
      name: "reports a list of bases rather than a single preset",
      content: config({ extends: ["@voidmix/tsconfig/node.json", "./local.json"] }),
      expected: { message: "extends a list rather than a single preset" },
    },
    {
      name: "reports a base outside the shared presets",
      content: config({ extends: "../../tsconfig.base.json" }),
      expected: { message: expect.stringContaining("instead of a shared preset") },
    },
    {
      name: "reports a preset name that does not exist",
      content: config({ extends: "@voidmix/tsconfig/nodejs.json" }),
      expected: {
        message: expect.stringContaining("which is not a preset packages/tsconfig exports"),
      },
    },
    {
      name: "reports a value the immediate preset already sets",
      content: config({
        extends: "@voidmix/tsconfig/browser.json",
        compilerOptions: { allowImportingTsExtensions: true },
      }),
      expected: {
        check: "tsconfig.redundant",
        location,
        message:
          "restates allowImportingTsExtensions, which packages/tsconfig/browser.json already sets to the same value",
        fix: expect.stringContaining("delete allowImportingTsExtensions"),
      },
    },
    {
      name: "reports a value inherited two levels up, naming the file that sets it",
      content: config({
        extends: "@voidmix/tsconfig/node.json",
        compilerOptions: { noEmit: true },
      }),
      expected: { message: expect.stringContaining("packages/tsconfig/base.json already sets") },
    },
    {
      name: "reports malformed JSON and says comments are not allowed",
      content: "{ // a comment\n}",
      expected: { message: "is not valid JSON", fix: expect.stringContaining("no comments") },
    },
  ])("$name", ({ content, expected }) => {
    expectOnlyFinding(validate(content), expected);
  });

  it.each([
    ["missing parent", "broken", { broken: { extends: "./missing.json" } }],
    [
      "missing ancestor",
      "top",
      { top: { extends: "./middle.json" }, middle: { extends: "./missing.json" } },
    ],
    [
      "inheritance cycle",
      "one",
      { one: { extends: "./two.json" }, two: { extends: "./one.json" } },
    ],
    ["malformed JSON", "broken", { broken: "{ not json" }],
  ])("reports an invalid preset chain: %s", (_name, entry, files) => {
    const brokenPresets = presetFiles(files);
    const findings = validate(
      config({ extends: `@voidmix/tsconfig/${entry}.json` }),
      brokenPresets,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("preset chain is invalid");
  });

  it.each([
    ["new include", { include: ["src/**/*.ts"] }],
    ["changed option", { compilerOptions: { types: ["node", "vite/client"] } }],
  ])("accepts a consumer with a %s", (_name, overrides) => {
    expect(validate(config({ extends: "@voidmix/tsconfig/node.json", ...overrides }))).toEqual([]);
  });
});

describe("isPresetFile", () => {
  it("accepts a preset and rejects the manifest beside it", () => {
    expect(isPresetFile("packages/tsconfig/base.json")).toBe(true);
    expect(isPresetFile("packages/tsconfig/package.json")).toBe(false);
    expect(isPresetFile("packages/db/tsconfig.json")).toBe(false);
  });
});

describe("fixWorkspaceTypeScriptConfig", () => {
  it("deletes the restated options and the emptied compilerOptions with them", () => {
    const content = config({
      extends: "@voidmix/tsconfig/node.json",
      compilerOptions: { noEmit: true, types: ["node"] },
      include: ["src/**/*.ts"],
    });

    const fixed = fix(content);

    expect(JSON.parse(fixed)).toEqual({
      extends: "@voidmix/tsconfig/node.json",
      include: ["src/**/*.ts"],
    });
    expect(validate(fixed)).toEqual([]);
  });

  it("keeps an override that changes a value, deleting only the copy beside it", () => {
    const content = config({
      extends: "@voidmix/tsconfig/node.json",
      compilerOptions: { noEmit: true, types: ["node", "vite/client"] },
    });

    expect(JSON.parse(fix(content)).compilerOptions).toEqual({
      types: ["node", "vite/client"],
    });
  });

  it.each([
    ["conforming", { extends: "@voidmix/tsconfig/node.json", include: ["src/**/*.ts"] }, presets],
    [
      "unknown preset",
      { extends: "../../tsconfig.base.json", compilerOptions: { noEmit: true } },
      presets,
    ],
    [
      "damaged chain",
      { extends: "@voidmix/tsconfig/broken.json", compilerOptions: { strict: true } },
      presetFiles({ broken: { extends: "./missing.json" } }),
    ],
  ])("leaves a %s config byte-identical", (_name, body, source) => {
    const content = config(body);
    expect(fix(content, source)).toBe(content);
  });

  it("is idempotent", () => {
    const once = fix(
      config({ extends: "@voidmix/tsconfig/node.json", compilerOptions: { noEmit: true } }),
    );

    expect(fix(once)).toBe(once);
  });
});

function validate(content: string, source = presets) {
  return validateWorkspaceTypeScriptConfig(location, content, source);
}
function fix(content: string, source = presets) {
  return fixWorkspaceTypeScriptConfig(content, source);
}
