import { describe, expect, it } from "vite-plus/test";
import { parseCliArgs } from "../../src/commands/args";

describe("CLI global arguments", () => {
  it("keeps ordinary command arguments and defaults all flags to false", () => {
    expect(parseCliArgs(["jobs", "list"])).toEqual({
      positionals: ["jobs", "list"],
      options: {},
      json: false,
      yes: false,
      help: false,
      version: false,
    });
  });

  it("recognizes global options before, between and after command arguments", () => {
    expect(
      parseCliArgs([
        "--profile",
        "work",
        "files",
        "--json",
        "authorize",
        "/tmp/工作 目录",
        "--data-dir",
        "/tmp/Raypx 数据",
        "--yes",
      ]),
    ).toEqual({
      positionals: ["files", "authorize", "/tmp/工作 目录"],
      options: { profile: "work", dataDir: "/tmp/Raypx 数据" },
      json: true,
      yes: true,
      help: false,
      version: false,
    });
  });

  it("accepts equals syntax for string options without splitting their values", () => {
    expect(
      parseCliArgs(["--profile=work", "jobs", "list", "--data-dir=/tmp/资料 = archive"]),
    ).toMatchObject({
      positionals: ["jobs", "list"],
      options: { profile: "work", dataDir: "/tmp/资料 = archive" },
    });
  });

  it.each([
    ["--help", "help"],
    ["-h", "help"],
    ["--version", "version"],
    ["-v", "version"],
  ] as const)("recognizes %s as a boolean global option", (flag, field) => {
    const parsed = parseCliArgs(["jobs", flag, "list"]);
    expect(parsed.positionals).toEqual(["jobs", "list"]);
    expect(parsed[field]).toBe(true);
  });

  it("preserves JSON strings and Unicode whitespace as single positional arguments", () => {
    const payload = JSON.stringify({
      name: "任务　名称",
      args: ["--help", "--version", "--profile=private", "--json", "--yes"],
      text: "line one\nline two\t结束",
    });
    expect(parseCliArgs(["jobs", "create", payload, "--json"])).toEqual({
      positionals: ["jobs", "create", payload],
      options: {},
      json: true,
      yes: false,
      help: false,
      version: false,
    });
  });

  it("treats every argument after the first delimiter as positional data", () => {
    const tail = ["--help", "--version", "--json", "--yes", "--profile", "", "--", "-h"];
    expect(parseCliArgs(["tools", "run", "--profile=work", "--", ...tail])).toEqual({
      positionals: ["tools", "run", ...tail],
      options: { profile: "work" },
      json: false,
      yes: false,
      help: false,
      version: false,
    });
  });

  it.each(["--unknown", "--JSON", "--data_dir", "-p", "-x"])(
    "rejects unknown option %s",
    (flag) => {
      expect(() => parseCliArgs(["jobs", "list", flag])).toThrow(Error);
    },
  );

  it.each([
    ["--profile"],
    ["--data-dir"],
    ["--profile", "--json"],
    ["--data-dir", "--yes"],
    ["--profile", "-h"],
    ["--data-dir", "--"],
  ])("rejects a missing string value in %j", (...args) => {
    expect(() => parseCliArgs(args)).toThrow(Error);
  });

  it.each([["--profile", ""], ["--data-dir", ""], ["--profile="], ["--data-dir="]])(
    "rejects an empty string value in %j",
    (...args) => {
      expect(() => parseCliArgs(args)).toThrow(Error);
    },
  );

  it.each([
    ["--profile", "work", "--profile=work"],
    ["--data-dir=/tmp/first", "--data-dir", "/tmp/second"],
    ["--json", "--json"],
    ["--yes", "--yes"],
    ["--help", "-h"],
    ["-h", "--help"],
    ["--version", "-v"],
    ["-v", "--version"],
  ])("rejects repeated options in %j", (...args) => {
    expect(() => parseCliArgs(args)).toThrow(Error);
  });

  it.each([
    "--json=true",
    "--json=false",
    "--yes=true",
    "--help=true",
    "-h=true",
    "--version=false",
    "-v=false",
  ])("rejects a value supplied to boolean option %s", (flag) => {
    expect(() => parseCliArgs([flag])).toThrow(Error);
  });
});
