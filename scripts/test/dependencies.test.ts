import { expect, test } from "vite-plus/test";
import { checkDependencyVersions } from "../lib/dependencies/check.ts";

function fixture() {
  const catalog: Record<string, string> = {
    "vite-plus": "1.1.0",
    vite: "npm:@voidzero-dev/vite-plus-core@1.1.0",
    vitest: "5.0.3",
    "@vitest/coverage-v8": "5.0.3",
    "@vitest/browser-playwright": "5.0.3",
    playwright: "1.64.0",
  };
  const root = {
    workspaces: { catalog },
    devDependencies: { vitest: "catalog:", playwright: "catalog:" },
    overrides: { "vite@*": catalog.vite },
  };
  const ui = {
    devDependencies: {
      "@vitest/browser-playwright": "catalog:",
      playwright: "catalog:",
      storybook: "10.6.1",
      "@storybook/addon-vitest": "10.6.1",
    },
    peerDependencies: { react: "^19.0.0" },
  };
  const installed = { version: "1.1.0", dependencies: { vitest: "5.0.3", vite: catalog.vite } };
  const manifests = [
    { path: "package.json", value: root },
    { path: "packages/ui/package.json", value: ui },
  ];
  return {
    catalog,
    root,
    ui,
    installed,
    check: () => checkDependencyVersions(manifests, installed),
  };
}

test("accepts one coherent catalog with independent peer compatibility ranges", () => {
  expect(fixture().check()).toEqual([]);
});

test("uses the installed Vite+ dependency contract even if its core release number differs", () => {
  const input = fixture();
  const alias = "npm:@voidzero-dev/vite-plus-core@1.0.9";
  input.catalog.vite = alias;
  input.root.overrides["vite@*"] = alias;
  input.installed.dependencies.vite = alias;
  expect(input.check()).toEqual([]);
});

test("rejects Vite alias or override drifting from the Vite+ release", () => {
  const input = fixture();
  input.catalog.vite = "^8.0.0";
  input.root.overrides["vite@*"] = "npm:@voidzero-dev/vite-plus-core@1.0.0";
  expect(input.check().join("\n")).toContain("catalog.vite");
  expect(input.check().join("\n")).toContain("overrides.vite@*");
});

test("rejects updating Vitest plugins without the Vite+ bundled runner", () => {
  const input = fixture();
  input.catalog["@vitest/coverage-v8"] = "5.1.0";
  input.catalog["@vitest/browser-playwright"] = "5.1.0";
  expect(input.check()).toHaveLength(2);
  expect(input.check().join("\n")).toContain("expected 5.0.3");
});

test("detects a stale installation before running checks with the wrong toolchain", () => {
  const input = fixture();
  input.installed.version = "1.0.0";
  expect(input.check().join("\n")).toContain("run bun install");
});

test("rejects individual workspace overrides of shared tools", () => {
  const input = fixture();
  input.ui.devDependencies.playwright = "1.63.0";
  expect(input.check().join("\n")).toContain("use catalog:");
  expect(input.check().join("\n")).toContain("expected 1.64.0, found 1.63.0");
});

test("rejects a missing catalog entry instead of accepting an unresolved reference", () => {
  const input = fixture();
  delete input.catalog.playwright;
  expect(input.check().join("\n")).toContain("missing root catalog entry");
});

test("rejects mismatched Storybook addons and non-exact tool versions", () => {
  const input = fixture();
  input.ui.devDependencies["@storybook/addon-vitest"] = "10.7.0";
  expect(input.check().join("\n")).toContain("expected 10.6.1");
  input.ui.devDependencies["@storybook/addon-vitest"] = "^10.6.1";
  expect(input.check().join("\n")).toContain("exact stable version");
});

test("invalid manifest data yields diagnostics rather than assuming compatibility", () => {
  expect(checkDependencyVersions([{ path: "package.json", value: null }], {})).not.toEqual([]);
});
