import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkLocales, writeLocaleTypes } from "./policy.js";
import { workspaceFixtures } from "../tests/helpers/workspace.js";

const { fixture, member } = workspaceFixtures();

function localeFixture(messages = false) {
  const root = fixture();
  member(root, "i18n", {
    extra: {
      exports: {
        "./config": "./src/config.ts",
        ...(messages
          ? {
              "./messages/en": "./locales/en/index.ts",
              "./messages/zh": "./locales/zh/index.ts",
            }
          : {}),
      },
    },
  });
  writeFileSync(
    join(root, "packages/i18n/src/config.ts"),
    'export default { defaultLocale: "en", locales: { en: "English", zh: "简体中文" } } as const;',
  );
  return root;
}

function entry(folder: string) {
  const names: string[] = [];
  const imports = readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const key = name.replace(/\.json$/, "");
      names.push(key);
      return `import ${key} from "./${name}" with { type: "json" };`;
    });
  writeFileSync(
    join(folder, "index.ts"),
    imports.join("\n") + `\nexport default { ${names.join(", ")} } as const;\n`,
  );
}

function catalog(
  root: string,
  locale: string,
  namespace: string,
  value: unknown,
  workspace = "messages",
) {
  const path = join(root, `packages/${workspace}/locales/${locale}/${namespace}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
  entry(dirname(path));
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

  it("requires every supported language and matching namespace files", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi" });
    expect(checkLocales(root).join("\n")).toContain("locales/zh: missing catalogs");
    catalog(root, "zh", "common", { hello: "你好" });
    expect(checkLocales(root)).toEqual(
      expect.arrayContaining([
        "packages/messages/locales/zh: missing namespaces: auth",
        "packages/messages/locales/zh: unexpected namespaces: common",
      ]),
    );
    rmSync(join(root, "packages/messages/locales/zh/common.json"));
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

  it("rejects a TypeScript catalog without executing it", () => {
    const root = localeFixture();
    member(root, "messages");
    for (const locale of ["en", "zh"]) catalog(root, locale, "auth", { hello: "Hi" });
    writeFileSync(
      join(root, "packages/messages/locales/zh/legacy.ts"),
      'throw new Error("must not execute"); export default { hello: "你好" } as const;',
    );
    expect(checkLocales(root)).toEqual([
      "packages/messages/locales/zh/legacy.ts: catalogs are JSON; move these messages to a .json file",
    ]);
  });

  it("rejects an entirely deleted source catalog directory", () => {
    const root = localeFixture(true);
    expect(checkLocales(root)).toEqual(["packages/i18n/locales: missing locale catalogs"]);
  });
});

describe("JSON catalogs and their declarations", () => {
  it("accepts JSON namespaces in every language and ignores their declarations", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi {name}" });
    catalog(root, "zh", "auth", { hello: "你好 {name}" });
    expect(checkLocales(root)).toEqual([]);
    expect(writeLocaleTypes(root)).toEqual(["packages/messages/locales/en/auth.d.json.ts"]);
    expect(checkLocales(root)).toEqual([]);
  });

  it("writes literal-typed declarations for the reference language only", () => {
    const root = localeFixture();
    member(root, "messages");
    const source = catalog(root, "en", "auth", { nested: { hello: "Hi {name}" } });
    catalog(root, "zh", "auth", { nested: { hello: "你好 {name}" } });
    const declaration = join(root, "packages/messages/locales/en/auth.d.json.ts");
    writeLocaleTypes(root);
    expect(readFileSync(declaration, "utf8")).toBe(
      [
        "// Generated from auth.json by `raypx-dev i18n types`. Do not edit.",
        'declare const messages: {\n  "nested": {\n    "hello": "Hi {name}"\n  }\n};',
        "export = messages;",
        "",
      ].join("\n"),
    );
    expect(existsSync(join(root, "packages/messages/locales/zh/auth.d.json.ts"))).toBe(false);
    // Unchanged catalogs are not rewritten; a removed catalog takes its declaration along.
    expect(writeLocaleTypes(root)).toEqual([]);
    rmSync(source);
    expect(writeLocaleTypes(root)).toEqual(["packages/messages/locales/en/auth.d.json.ts"]);
    expect(existsSync(declaration)).toBe(false);
  });

  it.each([42, null, []])("rejects non-string JSON leaves: %j", (invalid) => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi" });
    catalog(root, "zh", "auth", { hello: invalid });
    expect(checkLocales(root).join("\n")).toContain("zh/auth.json:");
  });

  it("reports invalid JSON and ICU differences in mixed catalogs", () => {
    const root = localeFixture();
    member(root, "messages");
    catalog(root, "en", "auth", { hello: "Hi {name}" });
    const path = catalog(root, "zh", "auth", { hello: "你好 {other}" });
    expect(checkLocales(root).join("\n")).toContain("auth.hello changes ICU arguments");
    writeFileSync(path, '{"hello":');
    expect(checkLocales(root).join("\n")).toContain("zh/auth.json:");
  });

  it("rejects namespaces owned by more than one workspace", () => {
    const root = localeFixture();
    member(root, "messages");
    member(root, "another");
    for (const locale of ["en", "zh"]) {
      catalog(root, locale, "auth", { hello: "Hello" });
      catalog(root, locale, "auth", { hello: "Hello" }, "another");
    }
    expect(checkLocales(root).join("\n")).toContain("namespace auth is already owned by");
  });

  it("rejects namespace imports omitted from the exported entry", () => {
    const root = localeFixture();
    member(root, "messages");
    for (const locale of ["en", "zh"]) catalog(root, locale, "auth", { hello: "Hello" });
    const path = join(root, "packages/messages/locales/en/index.ts");
    writeFileSync(
      path,
      'import auth from "./auth.json" with { type: "json" }; export default {} as const;',
    );
    expect(checkLocales(root)).toContain(
      "packages/messages/locales/en/index.ts: missing namespace auth from ./auth.json",
    );
    rmSync(path);
    expect(checkLocales(root)).toContain(
      "packages/messages/locales/en/index.ts: missing catalog entry",
    );
  });

  it("accepts applications composing shared catalogs without local namespaces", () => {
    const root = localeFixture(true);
    member(root, "messages", { metadata: { kind: "app" } });
    for (const locale of ["en", "zh"]) {
      catalog(root, locale, "common", { hello: "Hello" }, "i18n");
      const path = join(root, `packages/messages/locales/${locale}/index.ts`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `import common from "@raypx/i18n/messages/${locale}"; export default { ...common } as const;`,
      );
    }
    expect(checkLocales(root)).toEqual([]);
  });

  it.each(["@raypx/i18n/messages/zh", "../zh/index.js", "./auth.json"])(
    "rejects a spread from outside the same-language shared entries: %s",
    (specifier) => {
      const root = localeFixture(true);
      member(root, "messages", { metadata: { kind: "app" } });
      for (const locale of ["en", "zh"]) {
        catalog(root, locale, "common", { hello: "Hello" }, "i18n");
        catalog(root, locale, "auth", { hello: "Hello" });
      }
      writeFileSync(
        join(root, "packages/messages/locales/en/index.ts"),
        `import auth from "./auth.json" with { type: "json" }; import shared from "${specifier}";
        export default { auth, ...shared } as const;`,
      );
      expect(checkLocales(root)).toContain(
        "packages/messages/locales/en/index.ts: spreads must use same-language public catalog entries",
      );
    },
  );

  it("rejects duplicate namespace contributions from shared spreads", () => {
    const root = localeFixture(true);
    member(root, "messages", { metadata: { kind: "app" } });
    for (const locale of ["en", "zh"]) {
      catalog(root, locale, "common", { hello: "Hello" }, "i18n");
      const path = join(root, `packages/messages/locales/${locale}/index.ts`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `import common from "@raypx/i18n/messages/${locale}";
        export default { ...common, ...common } as const;`,
      );
    }
    expect(checkLocales(root)).toContain(
      "packages/messages/locales/en/index.ts: namespace common is assembled more than once",
    );
  });

  it("rejects unowned namespace aliases in language entries", () => {
    const root = localeFixture();
    member(root, "messages");
    for (const locale of ["en", "zh"]) catalog(root, locale, "auth", { hello: "Hello" });
    writeFileSync(
      join(root, "packages/messages/locales/en/index.ts"),
      'import auth from "./auth.json" with { type: "json" }; export default { auth, extra: auth } as const;',
    );
    expect(checkLocales(root)).toContain(
      "packages/messages/locales/en/index.ts: namespace extra has no owned catalog",
    );
  });

  it.each(["auth, common: auth, ...shared", "auth, ...shared, common: auth"])(
    "rejects namespace collisions between local properties and shared spreads: %s",
    (properties) => {
      const root = localeFixture(true);
      member(root, "messages", { metadata: { kind: "app" } });
      for (const locale of ["en", "zh"]) {
        catalog(root, locale, "common", { hello: "Hello" }, "i18n");
        catalog(root, locale, "auth", { hello: "Hello" });
      }
      writeFileSync(
        join(root, "packages/messages/locales/en/index.ts"),
        `import auth from "./auth.json" with { type: "json" }; import shared from "@raypx/i18n/messages/en";
        export default { ${properties} } as const;`,
      );
      expect(checkLocales(root)).toContain(
        "packages/messages/locales/en/index.ts: namespace common is assembled more than once",
      );
    },
  );
});
