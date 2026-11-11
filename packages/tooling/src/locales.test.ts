import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { checkLocales } from "./policy.js";
import { workspaceFixtures } from "../tests/helpers/workspace.js";

const { fixture, member } = workspaceFixtures();

function localeFixture(messages = false) {
  const root = fixture();
  member(root, "i18n", {
    extra: {
      exports: {
        "./config": "./src/config.ts",
        ...(messages ? { "./messages": "./locales/index.ts" } : {}),
      },
    },
  });
  writeFileSync(
    join(root, "packages/i18n/src/config.ts"),
    'export default { defaultLocale: "en", locales: { en: "English", zh: "简体中文" } } as const;',
  );
  return root;
}

function catalog(root: string, locale: string, namespace: string, value: unknown) {
  const path = join(root, `packages/messages/locales/${locale}/${namespace}.ts`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `export default ${JSON.stringify(value)} as const;`);
  return path;
}

describe("locale conventions", () => {
  it("compares namespaces and nested interpolation arguments across languages", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { nested: { hello: "Hi {name}" } });
    catalog(root, "zh", "auth", { nested: { hello: "你好 {email}" } });
    expect(checkLocales(root).join("\n")).toContain("auth.nested.hello changes ICU arguments");
  });

  it("reports only the invalid ICU side and the full namespace path", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi {name}" });
    catalog(root, "zh", "auth", { hello: "你好 {" });
    expect(checkLocales(root)).toEqual([
      expect.stringMatching(
        /^packages\/messages\/locales\/zh: zh contains invalid ICU syntax at auth\.hello;/,
      ),
    ]);
  });

  it("checks rich-text callback parity with the shared ICU parser", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "<strong>{name}</strong>" });
    catalog(root, "zh", "auth", { hello: "<em>{name}</em>" });
    expect(checkLocales(root)).toEqual([
      expect.stringContaining("auth.hello changes rich-text tags between en and zh"),
    ]);
  });

  it("rejects non-string catalog values and invalid TypeScript", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi" });
    const path = catalog(root, "zh", "auth", { hello: 42 });
    expect(checkLocales(root).join("\n")).toContain("zh/auth.ts");
    writeFileSync(path, "export default { hello:");
    expect(checkLocales(root).join("\n")).toContain("zh/auth.ts");
  });

  it("requires every supported language and matching namespace files", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi" });
    expect(checkLocales(root).join("\n")).toContain("locales/zh: missing TypeScript catalogs");
    catalog(root, "zh", "common", { hello: "你好" });
    expect(checkLocales(root)).toEqual(
      expect.arrayContaining([
        "packages/messages/locales/zh: missing namespaces: auth",
        "packages/messages/locales/zh: unexpected namespaces: common",
      ]),
    );
    rmSync(join(root, "packages/messages/locales/zh/common.ts"));
    catalog(root, "zh", "auth", { hello: "你好" });
    catalog(root, "fr", "auth", { hello: "Salut" });
    expect(checkLocales(root)).toEqual([
      "packages/messages/locales/fr: fr is not a supported locale",
    ]);
  });

  it("detects missing keys within a shared namespace", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi", goodbye: "Bye" });
    catalog(root, "zh", "auth", { hello: "你好" });
    expect(checkLocales(root).join("\n")).toContain("auth.goodbye");
  });

  it("reads the language policy statically and rejects an invalid default", () => {
    const root = localeFixture();
    const config = join(root, "packages/i18n/src/config.ts");
    writeFileSync(
      config,
      'throw new Error("must not execute"); export default { defaultLocale: "ja", locales: { en: "English", ja: "日本語" } } as const;',
    );
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi {name}" });
    catalog(root, "ja", "auth", { hello: "こんにちは" });
    expect(checkLocales(root).join("\n")).toContain(
      "auth.hello changes ICU arguments between ja and en",
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
      "auth.hello changes ICU arguments between ja and en",
    );
  });

  it("reads static catalogs and type-only annotations without executing modules", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi {name}" });
    const path = catalog(root, "zh", "auth", {});
    writeFileSync(
      path,
      `import type en from "../en/auth.js";
      import type { CatalogShape } from "@raypx-kit/intl/types";
      throw new Error("must not execute");
      export default { hello: "你好 {name}" } as const satisfies CatalogShape<typeof en>;`,
    );
    expect(checkLocales(root)).toEqual([]);
  });

  it("rejects computed message values without evaluating them", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi" });
    const path = catalog(root, "zh", "auth", {});
    writeFileSync(
      path,
      'export default { hello: (() => { throw new Error("must not execute"); })() } as const;',
    );
    expect(checkLocales(root)).toEqual([
      expect.stringContaining("zh/auth.ts: catalogs must contain static string objects"),
    ]);
  });

  it("rejects an entirely deleted source catalog directory", () => {
    const root = localeFixture(true);
    expect(checkLocales(root)).toEqual(["packages/i18n/locales: missing locale catalogs"]);
  });
});
