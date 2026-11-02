import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checkMarkdownLength } from "../../src/policy.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture } = workspaceFixtures();

it("allows 500 Markdown lines and reports current documents above the limit", () => {
  const root = fixture();
  const lines = (count: number) => Array.from({ length: count }, () => "line").join("\n");
  writeFileSync(join(root, "README.md"), `${lines(500)}\n`);
  writeFileSync(join(root, "notes.md"), `${lines(501)}\n`);
  mkdirSync(join(root, "docs/history"), { recursive: true });
  writeFileSync(join(root, "docs/history/archived.md"), `${lines(501)}\n`);

  expect(checkMarkdownLength(root)).toEqual(["notes.md: Markdown document exceeds 500 lines"]);
});
