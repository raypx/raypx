import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { execute, pass } from "../helpers/cache";
import { validationProject } from "../helpers/cache-validation";

it("caches policy while rejecting new violations and deleted required inputs", () => {
  const root = validationProject();
  const run = () => execute(root, "policy", {}, "cache-fixture#task:policy");
  pass(run());
  const timing = join(root, ".artifacts/verification/prechecks/policy.json");
  const evidence = readFileSync(timing, "utf8");
  expect(JSON.parse(evidence).durationMs).toBeGreaterThanOrEqual(0);
  rmSync(timing);
  expect(pass(run()).log).toContain("cache hit");
  expect(readFileSync(timing, "utf8")).toBe(evidence);
  writeFileSync(join(root, "packages/feature/src/new.ts"), "export const value = 1;");
  expect(pass(run()).log).toContain("cache miss");
  expect(pass(run()).log).toContain("cache hit");
  writeFileSync(join(root, "packages/feature/src/new.ts"), 'import "undeclared-library";');
  for (let attempt = 0; attempt < 2; attempt++) {
    const invalid = run();
    expect(invalid.code).not.toBe(0);
    expect(invalid.log).toContain("undeclared runtime dependency");
  }
  writeFileSync(join(root, "packages/feature/src/new.ts"), "export const value = 2;");
  pass(run());
  rmSync(join(root, "packages/feature/AGENTS.md"));
  const deleted = run();
  expect(deleted.code).not.toBe(0);
  expect(deleted.log).toContain("missing AGENTS.md");
  writeFileSync(join(root, "packages/feature/AGENTS.md"), "Fixture instructions.\n");
  pass(run());
  writeFileSync(join(root, ".nvmrc"), "24\n");
  const pin = run();
  expect(pin.code).not.toBe(0);
  expect(pin.log).toContain("only runtime pin");
}, 60000);

it("caches locale parity while tracking changed, new and deleted catalogs and language policy", () => {
  const root = validationProject();
  const run = () => execute(root, "locales", {}, "cache-fixture#task:locales");
  pass(run());
  expect(pass(run()).log).toContain("cache hit");
  const english = join(root, "packages/feature/src/messages/en.ts");
  writeFileSync(english, 'export default { label: "Label", added: "Added" };');
  expect(run().code).not.toBe(0);
  writeFileSync(
    join(root, "packages/feature/src/messages/zh.ts"),
    'export default { label: "标签", added: "新增" };',
  );
  pass(run());
  expect(pass(run()).log).toContain("cache hit");
  rmSync(english);
  expect(run().code).not.toBe(0);
  writeFileSync(english, 'export default { label: "Label", added: "Added" };');
  pass(run());
  const folder = join(root, "packages/i18n/src/messages");
  mkdirSync(folder);
  writeFileSync(join(folder, "en.json"), '{"label":"Label"}');
  const added = run();
  expect(added.code).not.toBe(0);
  expect(added.log).toContain("missing zh catalog");
  rmSync(folder, { recursive: true });
  pass(run());
  writeFileSync(
    join(root, "packages/i18n/src/config.ts"),
    'export default { locales: { en: "English", zh: "中文", fr: "Français" }, defaultLocale: "en" };',
  );
  const config = run();
  expect(config.code).not.toBe(0);
  expect(config.log).toContain("missing fr catalog");
}, 60000);
