import { expect, it } from "vitest";
import { testLayer } from "./test-sources.js";
import { baselineCases, compareCases, ownerMap } from "./inventory.js";

const original = {
  workspace: "web",
  file: "apps/web/tests/view.test.ts",
  name: "keeps account boundaries",
};

it("compares case multiplicity while allowing file moves, explicit ownership moves and new coverage", () => {
  const moved = {
    ...original,
    workspace: "@raypx/feature",
    file: "packages/feature/tests/view.test.ts",
  };
  const added = { ...moved, name: "handles a late response" };
  expect(
    compareCases([original, original], [moved, added], { [original.file]: moved.workspace }),
  ).toEqual({
    missing: [{ ...original, workspace: moved.workspace }],
    added: [added],
  });
  expect(compareCases([original], [{ ...original, file: "tests/new-location.test.ts" }])).toEqual({
    missing: [],
    added: [],
  });
});

it("rejects malformed baselines and misspelled ownership mappings instead of silently skipping identities", () => {
  expect(() => baselineCases({ cases: [{ workspace: "web" }] })).toThrow("identity");
  expect(() => ownerMap({ [original.file]: 1 })).toThrow("identity");
  expect(() => compareCases([original], [], { "wrong/path": "@raypx/feature" })).toThrow(
    "baseline file",
  );
  expect(baselineCases({ cases: [original] })).toEqual([original]);
});

it("keeps app-owned browser acceptance outside ordinary Vitest inventory", () => {
  expect(testLayer("e2e/settings.spec.ts")).toBe("external");
  expect(testLayer("tests/integration/settings.spec.ts")).toBe("integration");
});
