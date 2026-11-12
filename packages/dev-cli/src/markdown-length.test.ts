import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkMarkdownLength } from "./policy.js";
import { workspaceFixtures } from "../tests/helpers/workspace.js";

const { fixture } = workspaceFixtures();

it("allows 1000 Markdown lines and reports current documents above the limit", () => {
  const root = fixture();
  const lines = (count: number) => Array.from({ length: count }, () => "line").join("\n");
  writeFileSync(join(root, "README.md"), `${lines(1000)}\n`);
  writeFileSync(join(root, "notes.md"), `${lines(1001)}\n`);
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs/guide.md"), `${lines(1001)}\n`);
  mkdirSync(join(root, "e2e/test-results/desktop/failure"), { recursive: true });
  writeFileSync(join(root, "e2e/test-results/desktop/failure/error-context.md"), lines(1001));
  mkdirSync(join(root, ".agents/skills/vendor"), { recursive: true });
  writeFileSync(join(root, ".agents/skills/vendor/SKILL.md"), lines(1001));
  mkdirSync(join(root, "skills/example"), { recursive: true });
  symlinkSync(
    join(root, ".agents/skills/vendor"),
    join(root, "skills/vendor"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(join(root, "skills/example/SKILL.md"), lines(1001));

  expect(checkMarkdownLength(root).sort()).toEqual([
    "docs/guide.md: Markdown document exceeds 1000 lines",
    "notes.md: Markdown document exceeds 1000 lines",
    "skills/example/SKILL.md: Markdown document exceeds 1000 lines",
  ]);
});
