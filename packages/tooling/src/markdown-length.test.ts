import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checkMarkdownLength } from "./policy.js";
import { workspaceFixtures } from "../tests/helpers/workspace.js";

const { fixture } = workspaceFixtures();

it("allows 500 Markdown lines and reports current documents above the limit", () => {
  const root = fixture();
  const lines = (count: number) => Array.from({ length: count }, () => "line").join("\n");
  writeFileSync(join(root, "README.md"), `${lines(500)}\n`);
  writeFileSync(join(root, "notes.md"), `${lines(501)}\n`);
  mkdirSync(join(root, "docs/history"), { recursive: true });
  writeFileSync(join(root, "docs/history/archived.md"), `${lines(501)}\n`);
  mkdirSync(join(root, ".agents/skills/vendor"), { recursive: true });
  writeFileSync(join(root, ".agents/skills/vendor/SKILL.md"), lines(501));
  mkdirSync(join(root, "skills/raypx"), { recursive: true });
  symlinkSync(
    join(root, ".agents/skills/vendor"),
    join(root, "skills/vendor"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(join(root, "skills/raypx/SKILL.md"), lines(501));

  expect(checkMarkdownLength(root).sort()).toEqual([
    "notes.md: Markdown document exceeds 500 lines",
    "skills/raypx/SKILL.md: Markdown document exceeds 500 lines",
  ]);
});
