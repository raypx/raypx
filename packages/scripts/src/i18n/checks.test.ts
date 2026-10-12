import { describe, expect, it } from "vite-plus/test";
import { checkCatalogPair, checkSourceFile } from "./checks.js";

function catalog(locale: "en" | "zh", content: string) {
  return { content, locale, location: `apps/web/messages/${locale}.json`, surface: "web" as const };
}
function catalogs(en: object, zh: object) {
  return checkCatalogPair(catalog("en", JSON.stringify(en)), catalog("zh", JSON.stringify(zh)));
}
function inspect(content: string, location = "apps/web/src/example.tsx") {
  return checkSourceFile({
    content: content.startsWith("<") ? `<>${content}</>` : content,
    location,
  });
}
const text = (copy: string) => `JSX contains hardcoded user-facing text: ${copy}`;
const attribute = (name: string) => `JSX attribute ${name} contains hardcoded user-facing text`;
const property = (name: string) => `UI property ${name} contains hardcoded user-facing text`;

describe("i18n catalog checks", () => {
  it.each([
    [
      "missing keys",
      { home: { title: "Home", subtitle: "Welcome" } },
      { home: { title: "首页" } },
      "zh is missing home.subtitle",
    ],
    [
      "node types",
      { home: { title: "Home" } },
      { home: { title: { value: "首页" } } },
      "home.title changes node type between en and zh",
    ],
    [
      "ICU arguments",
      { greeting: "Hello, {name}" },
      { greeting: "你好，{user}" },
      "greeting changes ICU arguments between en and zh",
    ],
    [
      "ordinary apostrophes",
      { date: "Today's {date}" },
      { date: "今天是 {day}" },
      "date changes ICU arguments between en and zh",
    ],
  ] as const)("reports mismatched %s", (_name, en, zh, message) => {
    expect(catalogs(en, zh)).toContainEqual(
      expect.objectContaining({ check: "catalog.parity", message }),
    );
  });
  it("ignores select and plural branch words when comparing ICU arguments", () => {
    expect(
      catalogs(
        {
          status:
            "{state, select, active {Active} suspended {Suspended} other {Unknown}} {count, plural, one {# file} other {# files}}",
        },
        {
          status:
            "{state, select, active {启用} suspended {停用} other {未知}} {count, plural, one {# 个文件} other {# 个文件}}",
        },
      ),
    ).toEqual([]);
  });
});

describe("i18n source checks", () => {
  it.each([
    [
      "translated and dynamic children",
      '<span>{t("title")}</span><span>{user.name}</span><span>{" "}</span><span>{done ? "✓" : "◐"}</span><span>{[domainValue]}</span><span>{"Fixed" && value}</span><span className="copy" />',
    ],
    [
      "technical fragments",
      "<div><small>v{version}</small><kbd>K</kbd><span>· ≤512 KB</span><span>Voidmix / Chat</span><span>{workspace} / Chat</span></div>",
    ],
    ["structural email examples", '<input placeholder="mail@example.com" type="email" />'],
    [
      "conditional domain properties",
      'const project = { status: locale === "zh" ? "active" : "paused" };',
    ],
  ])("allows %s", (_name, source) => {
    expect(inspect(source)).toEqual([]);
  });
  it.each([
    ["direct child literals", '<div>{"Hard text"}</div>', text("Hard text")],
    ["child templates", "<div>{`Hard text`}</div>", text("Hard text")],
    ["render props", '<Comp render={() => "Hard text"} />', text("Hard text")],
    [
      "attributes after templates",
      'const view = <div className={`a ${open ? "b" : "c"}`}><Link aria-label="Hard text" /></div>;',
      attribute("aria-label"),
    ],
    ["native language option copy", "<span>English</span>", text("English")],
    ["placeholder copy", '<input placeholder="Enter your email" />', attribute("placeholder")],
  ])("reports %s", (_name, source, message) => {
    expect(inspect(source)).toContainEqual(
      expect.objectContaining({ check: "source.hardcoded", message }),
    );
  });
  it.each([
    [
      "conditional and logical children",
      '<div>{ok ? "Good copy" : fallback && "Bad copy"}</div>',
      [text("Good copy"), text("Bad copy")],
    ],
    [
      "elements and fragments",
      "const view = <><span>Hello</span><span>hello</span></>;",
      [text("Hello"), text("hello")],
    ],
    [
      "user-facing attributes",
      '<button aria-label="Open" title="Open menu" className="open-button" id="open">Open</button>',
      [attribute("aria-label"), attribute("title"), text("Open")],
    ],
    [
      "braced and template attributes",
      'const view = <div className={`a ${open ? "b" : "c"}`}><Link aria-label={"Hard text"} /><input placeholder={"Enter email"} /><button aria-label={`Open ${name}`} /></div>;',
      [attribute("aria-label"), attribute("placeholder"), attribute("aria-label")],
    ],
    [
      "conditional metadata",
      'const head = [{ title: locale === "zh" ? "Voidmix | 创意工作" : "Voidmix | Creative work" }, { name: "description", content: locale === "zh" ? "中文描述" : "English description" }];',
      [property("title"), property("title"), property("content"), property("content")],
    ],
  ] as const)("reports all literals in %s", (_name, source, messages) => {
    const findings = inspect(source, "apps/web/src/routes/__root.tsx");
    expect(findings.filter((item) => item.check === "source.hardcoded")).toHaveLength(
      messages.length,
    );
    expect(findings.map((item) => item.message)).toEqual(messages);
  });
  it("reports literals in conditional UI label variables", () => {
    const findings = inspect('const currentLabel = locale === "zh" ? "简体中文" : "English";');
    expect(findings).toContainEqual(
      expect.objectContaining({
        check: "source.hardcoded",
        message: "UI variable currentLabel contains hardcoded user-facing text",
      }),
    );
    expect(findings.filter((item) => item.check === "source.hardcoded")).toHaveLength(2);
  });
  it("rejects fixed locales in Intl formatting calls", () => {
    expect(
      inspect('new Intl.DateTimeFormat("en").format(date);', "apps/web/src/format.ts"),
    ).toContainEqual(
      expect.objectContaining({
        check: "source.locale",
        message: "formatting call hardcodes locale en",
      }),
    );
  });
  it.each([
    [
      "client facade",
      'import { useTranslations } from "@voidmix/i18n/client";',
      "apps/web/src/page.tsx",
      "imports useTranslations directly from @voidmix/i18n/client",
    ],
    [
      "core implementation",
      'import { createFormatter } from "use-intl/core";',
      "apps/web/src/format.ts",
      "imports the use-intl implementation directly",
    ],
    [
      "server implementation",
      'import { getTranslations } from "use-intl/server";',
      "apps/web/src/server.ts",
      "imports the use-intl implementation directly",
    ],
  ])("enforces the %s boundary", (_name, source, location, message) => {
    expect(inspect(source, location)).toContainEqual(
      expect.objectContaining({ check: "source.facade", message }),
    );
  });
  it("allows the approved translation facade", () => {
    expect(
      inspect(
        'import { useTranslations } from "@voidmix/i18n/client";',
        "apps/web/src/i18n/client.ts",
      ),
    ).toEqual([]);
  });
});

describe("parser boundaries", () => {
  it.each([
    ["quoted ICU braces", "'{ignored}' {name}", "'{ignored}' {name}"],
    [
      "nested plural",
      "{n, plural, one {{name}} other {{name} has #}}",
      "{n, plural, one {{name}} other {{name}有#}}",
    ],
    ["escaped apostrophes", "It''s {name}", "{name}说''"],
  ])("parses %s without inventing arguments", (_name, en, zh) => {
    expect(catalogs({ message: en }, { message: zh })).toEqual([]);
  });
  it("reports invalid ICU instead of treating it as an empty argument list", () => {
    expect(catalogs({ message: "{n, plural, one {One}}" }, { message: "一" })).toContainEqual(
      expect.objectContaining({ check: "catalog.parse" }),
    );
  });
  it("preserves UTF-16 source positions after multibyte characters", () => {
    const findings = inspect('const icon = "🧭";\nconst view = <div title="Save">你好</div>;');
    expect(findings.map(({ check, line, column }) => ({ check, line, column }))).toEqual([
      { check: "source.hardcoded", line: 2, column: 25 },
      { check: "source.hardcoded", line: 2, column: 32 },
    ]);
  });
  it("reports parse failures and preserves recovery/test exemptions", () => {
    expect(inspect("const view = <div")).toContainEqual(
      expect.objectContaining({ check: "source.parse", line: 1 }),
    );
    for (const location of [
      "apps/web/src/example.test.tsx",
      "apps/web/src/i18n/recovery-messages.ts",
    ])
      expect(inspect("const view = <div>Untranslated</div>;", location)).toEqual([]);
  });
});
