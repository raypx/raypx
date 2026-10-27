import { describe, expect, it } from "vite-plus/test";
import { outputLines, safeText, terminalLocale } from "../../../src/tui/text";

describe("terminal display text", () => {
  it("removes terminal commands, control characters and bidi overrides from display text", () => {
    expect(safeText("\u001b]52;c;clipboard\u0007Hello\r\n\u001b[2J世界\u202e\u0000")).toBe(
      "Hello\n世界",
    );
    expect(safeText("First\n\tsecond", true)).toBe("First second");
  });

  it("wraps long lines without splitting grapheme clusters and retains blank lines", () => {
    const source = "你好👩‍💻cafe\u0301".repeat(20);
    const lines = outputLines(source, 24);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(source);
    expect(lines.join("\n")).not.toMatch(/\u200d\n|e\n\u0301/);
    expect(outputLines("one\n\nthree")).toEqual(["one", "", "three"]);
  });

  it("expands tabs and removes terminal escapes before wrapping", () => {
    expect(outputLines("\u001b[31mone\tend\u001b[0m")).toEqual(["one    end"]);
    expect(outputLines("a".repeat(100), 20).every((line) => line.length <= 16)).toBe(true);
  });
});

describe("terminal language", () => {
  it.each([
    { env: { LANG: "zh_CN.UTF-8" }, locale: "zh" },
    { env: { LANG: "en_US.UTF-8", LC_MESSAGES: "zh_TW.UTF-8" }, locale: "zh" },
    { env: { LANG: "zh_CN.UTF-8", LC_ALL: "C.UTF-8" }, locale: "en" },
    { env: { LANG: "unsupported" }, locale: "en" },
    { env: {}, locale: "en" },
  ])("uses POSIX language precedence for $env", ({ env, locale }) => {
    expect(terminalLocale(env)).toBe(locale);
  });
});
