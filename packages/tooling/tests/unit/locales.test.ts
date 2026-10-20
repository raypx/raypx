import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { checkLocales } from "../../src/policy.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture, member } = workspaceFixtures();

function localeFixture() {
  const root = fixture();
  member(root, "i18n", { extra: { exports: { "./config": "./src/config.ts" } } });
  writeFileSync(
    join(root, "packages/i18n/src/config.ts"),
    'export default { defaultLocale: "en", locales: { en: "English", zh: "简体中文" } } as const;',
  );
  return root;
}

describe("locale conventions", () => {
  it("detects nested locale mismatches and interpolation drift without executing catalogs", () => {
    const root = localeFixture();
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
    const root = localeFixture();
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
    const root = localeFixture();
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
    const root = localeFixture();
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
    const root = localeFixture();
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
    const root = localeFixture();
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

  it("reads the declared language policy without executing it and rejects an invalid default", () => {
    const root = localeFixture();
    const config = join(root, "packages/i18n/src/config.ts");
    writeFileSync(
      config,
      'throw new Error("must not execute"); export default { defaultLocale: "ja", locales: { en: "English", ja: "日本語" } } as const;',
    );
    member(root, "messages");
    const directory = join(root, "packages/messages/src/messages");
    mkdirSync(directory);
    writeFileSync(join(directory, "en.ts"), 'export default { hello: "Hi {name}" } as const;');
    writeFileSync(join(directory, "ja.ts"), 'export default { hello: "こんにちは" } as const;');
    expect(checkLocales(root).join("\n")).toContain(
      "hello changes ICU arguments between ja and en",
    );
    writeFileSync(
      config,
      'export default { defaultLocale: "zh", locales: { en: "English" } } as const;',
    );
    expect(checkLocales(root)).toEqual([
      "packages/i18n/src/config.ts: locales need names and must include defaultLocale",
    ]);
    rmSync(config);
    expect(checkLocales(root, { locales: ["en", "ja"], base: "ja" }).join("\n")).toContain(
      "hello changes ICU arguments between ja and en",
    );
  });

  it("extends parity checks to newly supported locales", () => {
    const root = localeFixture();
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
