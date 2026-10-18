import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { checkArchitecture } from "@voidmix/devkit/architecture";
import type { Metadata } from "@voidmix/devkit/workspaces";
import { checkLocales } from "./policy.js";
import { discover } from "./repository.js";
import { scaffold } from "./scaffold.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-framework-test-"));
  roots.push(root);
  mkdirSync(join(root, "packages"));
  mkdirSync(join(root, "apps"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ workspaces: { packages: ["apps/*", "packages/*"] } }),
  );
  return root;
}
function member(
  root: string,
  name: string,
  options: {
    metadata?: Metadata;
    source?: string;
    deps?: Record<string, string>;
    extra?: Record<string, unknown>;
  } = {},
) {
  const path = `packages/${name}`;
  mkdirSync(join(root, path, "src"), { recursive: true });
  writeFileSync(
    join(root, path, "package.json"),
    JSON.stringify({
      name: `@raypx/${name}`,
      private: true,
      type: "module",
      exports: { ".": "./src/index.ts" },
      raypx: options.metadata ?? { kind: "library", target: "universal" },
      dependencies: options.deps ?? {},
      ...options.extra,
    }),
  );
  writeFileSync(join(root, path, "src/index.ts"), options.source ?? "export const answer = 42;");
  return path;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Raypx workspace conventions", () => {
  it("discovers a scaffolded package without editing any central list and refuses overwrite", () => {
    const root = fixture();
    const preview = scaffold(root, "feature-kit", { kind: "library", target: "universal" });
    expect(preview).toContain("packages/feature-kit/src/index.ts");
    expect(discover(root).workspaces).toHaveLength(0);
    scaffold(root, "feature-kit", { kind: "library", target: "universal", write: true });
    expect(discover(root).byName.has("@raypx/feature-kit")).toBe(true);
    expect(checkArchitecture(discover(root))).toEqual([]);
    expect(readFileSync(join(root, "packages/feature-kit/package.json"), "utf8")).not.toContain(
      '"build"',
    );
    expect(
      JSON.parse(readFileSync(join(root, "packages/feature-kit/package.json"), "utf8"))
        .devDependencies,
    ).toEqual({ "@voidmix/tsconfig": "catalog:dev" });
    expect(() =>
      scaffold(root, "feature-kit", { kind: "library", target: "universal", write: true }),
    ).toThrow("already exists");
    expect(() => scaffold(root, "../escape", { kind: "library", target: "universal" })).toThrow(
      "hyphenated",
    );
    expect(() => scaffold(root, "con", { kind: "library", target: "universal" })).toThrow(
      "reserved on Windows",
    );
  });

  it("detects nested locale mismatches and interpolation drift without executing catalogs", () => {
    const root = fixture();
    member(root, "messages");
    mkdirSync(join(root, "packages/messages/src/messages"));
    writeFileSync(
      join(root, "packages/messages/src/messages/en.ts"),
      'export default { auth: { hello: "Hi {name}" } } as const;',
    );
    writeFileSync(
      join(root, "packages/messages/src/messages/zh.ts"),
      'export default { auth: { hello: "你好 {email}" } } as const;',
    );
    expect(checkLocales(root).join("\n")).toContain("auth.hello changes ICU arguments");
  });

  it("reports only the invalid ICU catalog side and the nested message path", () => {
    const root = fixture();
    member(root, "messages");
    const directory = join(root, "packages/messages/src/messages");
    mkdirSync(directory);
    writeFileSync(
      join(directory, "en.ts"),
      'throw new Error("must not execute"); export default { auth: { hello: "Hi {name}" } } as const;',
    );
    writeFileSync(
      join(directory, "zh.ts"),
      'export default { auth: { hello: "你好 {" } } as const;',
    );
    expect(checkLocales(root)).toEqual([
      expect.stringMatching(
        /^packages\/messages\/src\/messages\/zh\.ts: zh contains invalid ICU syntax at auth\.hello;/,
      ),
    ]);
  });

  it("delegates rich-text callback parity to the shared ICU parser", () => {
    const root = fixture();
    member(root, "messages");
    const directory = join(root, "packages/messages/src/messages");
    mkdirSync(directory);
    writeFileSync(
      join(directory, "en.ts"),
      'export default { hello: "<strong>{name}</strong>" } as const;',
    );
    writeFileSync(join(directory, "zh.json"), JSON.stringify({ hello: "<em>{name}</em>" }));
    expect(checkLocales(root)).toEqual([
      expect.stringContaining("hello changes rich-text tags between en and zh"),
    ]);
  });

  it("accepts translated plural categories, reordered arguments and tag nesting", () => {
    const root = fixture();
    member(root, "messages");
    const directory = join(root, "packages/messages/src/messages");
    mkdirSync(directory);
    writeFileSync(
      join(directory, "en.ts"),
      'export default { hello: "<strong>{name}<em>{count, plural, one {# item} other {# items}}</em></strong>" } as const;',
    );
    writeFileSync(
      join(directory, "zh.ts"),
      'export default { hello: "<em>{count, plural, other {#项}}</em><strong>{name}</strong>" } as const;',
    );
    expect(checkLocales(root)).toEqual([]);
  });

  it("keeps catalog shape and safe static-reading checks", () => {
    const root = fixture();
    member(root, "messages");
    const directory = join(root, "packages/messages/src/messages");
    mkdirSync(directory);
    writeFileSync(join(directory, "en.ts"), "export default { nested: {} } as const;");
    writeFileSync(join(directory, "zh.ts"), 'export default { nested: "文本" } as const;');
    expect(checkLocales(root).join("\n")).toContain("nested changes node type");
    writeFileSync(
      join(directory, "zh.ts"),
      'export default { nested: (() => { throw new Error("must not execute"); })() } as const;',
    );
    expect(checkLocales(root).join("\n")).toContain(
      "zh.ts: catalogs must contain static string objects",
    );
  });
  it("requires a catalog for every supported locale and rejects unsupported ones", () => {
    const root = fixture();
    member(root, "messages");
    const directory = join(root, "packages/messages/src/messages");
    mkdirSync(directory);
    writeFileSync(join(directory, "en.ts"), 'export default { hello: "Hi" } as const;');
    expect(checkLocales(root)).toEqual([
      "packages/messages/src/messages: missing zh catalog for supported locales",
    ]);
    writeFileSync(join(directory, "zh.ts"), 'export default { hello: "你好" } as const;');
    writeFileSync(join(directory, "fr.json"), JSON.stringify({ hello: "Salut" }));
    writeFileSync(join(directory, "index.ts"), "export {};");
    expect(checkLocales(root)).toEqual([
      "packages/messages/src/messages/fr.json: fr is not a supported locale",
    ]);
  });
  it("extends parity checks to newly supported locales", () => {
    const root = fixture();
    member(root, "messages");
    const directory = join(root, "packages/messages/src/messages");
    mkdirSync(directory);
    writeFileSync(join(directory, "en.ts"), 'export default { hello: "Hi {name}" } as const;');
    writeFileSync(join(directory, "zh.ts"), 'export default { hello: "你好 {name}" } as const;');
    writeFileSync(join(directory, "ja.ts"), 'export default { hello: "こんにちは" } as const;');
    expect(checkLocales(root, { locales: ["en", "zh", "ja"], base: "en" })).toEqual([
      expect.stringMatching(
        /^packages\/messages\/src\/messages: hello changes ICU arguments between en and ja/,
      ),
    ]);
  });
});
