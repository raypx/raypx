import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checked, execute, pass, project } from "../helpers/cache.ts";

it.each([true, false])(
  "invalidates typecheck consumers and retains unrelated hits (automatic inputs: %s)",
  (automaticInputs) => {
    const root = project(automaticInputs);
    const tokens = checked(root, "tokens");
    const bridge = checked(root, "bridge", { "@raypx/tokens": "workspace:*" });
    const consumer = checked(root, "consumer", { "@raypx/bridge": "workspace:*" });
    checked(root, "independent");
    writeFileSync(join(tokens, "src/index.ts"), "export const value: number = 1;\n");
    writeFileSync(join(bridge, "src/index.ts"), 'export { value } from "@raypx/tokens";\n');
    writeFileSync(
      join(consumer, "src/index.ts"),
      'import { value } from "../../bridge/src/index"; export const result: number = value;\n',
    );
    pass(execute(root, "check"));
    const warm = execute(root, "check");
    expect(warm.code).toBe(0);
    expect(warm.log).toContain("4 cache hits");
    writeFileSync(join(tokens, "src/index.ts"), "export const value: number = 2;\n");
    const changed = execute(root, "check");
    expect(changed.code).toBe(0);
    expect(changed.log).toContain("1 cache hit");
    expect(changed.log).toContain("3 cache misses");
    writeFileSync(join(tokens, "src/index.ts"), 'export const value: string = "changed";\n');
    const invalid = execute(root, "check");
    expect(invalid.code).not.toBe(0);
    expect(invalid.log).toContain("not assignable to type 'number'");
  },
  30000,
);

it.each([true, false])(
  "tracks dependency declarations while excluding owned outputs (automatic inputs: %s)",
  (automaticInputs) => {
    const root = project(automaticInputs);
    const tokens = checked(root, "tokens");
    const consumer = checked(root, "consumer", { "@raypx/tokens": "workspace:*" });
    mkdirSync(join(tokens, "dist"));
    writeFileSync(join(tokens, "dist/value.d.ts"), "export declare const value: number;");
    writeFileSync(
      join(consumer, "src/index.ts"),
      'import { value } from "../../tokens/dist/value"; export const result: number = value;',
    );
    const selector = "@raypx/consumer#task:check";
    pass(execute(root, "check", {}, selector));
    expect(execute(root, "check", {}, selector).log).toContain("cache hit");
    mkdirSync(join(consumer, "dist"));
    writeFileSync(join(consumer, "dist/owned.d.ts"), "export declare const owned: string;");
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
    writeFileSync(join(tokens, "dist/value.d.ts"), "export declare const value: string;");
    const changed = execute(root, "check", {}, selector);
    expect(changed.code).not.toBe(0);
    expect(changed.log).toContain("not assignable to type 'number'");
  },
  30000,
);
