import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { checkDocumentLinks } from "./docs.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("reports only missing relative link targets", () => {
  const root = mkdtempSync(join(tmpdir(), "devkit-docs-test-"));
  roots.push(root);
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs/guide one.md"), "# Guide\n");
  writeFileSync(
    join(root, "README.md"),
    [
      "[guide](docs/guide%20one.md#setup)",
      '[titled](docs/guide%20one.md "Guide")',
      "[web](https://example.com) [anchor](#top) [absolute](/root)",
      "[missing](docs/missing.md)",
    ].join("\n"),
  );
  expect(checkDocumentLinks(root, ["README.md"])).toEqual([
    "README.md: broken documentation link docs/missing.md",
  ]);
});
