import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checkSpecPlacement } from "./policy.js";
import { workspaceFixtures } from "../tests/helpers/workspace.js";

const { fixture } = workspaceFixtures();

it("reserves *.spec.* for Playwright suites under e2e/", () => {
  const root = fixture();
  for (const file of [
    "e2e/tests/control.spec.ts",
    "apps/web/e2e/settings.spec.ts",
    "packages/ui/src/button.spec.tsx",
    "packages/ui/src/button.test.tsx",
    "packages/ui/node_modules/dep/index.spec.js",
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "");
  }
  expect(checkSpecPlacement(root)).toEqual([
    "packages/ui/src/button.spec.tsx: *.spec.* is reserved for Playwright under e2e/; use *.test.*",
  ]);
});
