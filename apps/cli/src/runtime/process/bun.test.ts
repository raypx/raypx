import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { BundledBun, bunShims } from "./bun";

const roots: string[] = [];
const temporary = () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-bun-shims-"));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("runs the embedded runtime with BUN_BE_BUN and quotes the executable for sh", () => {
  expect(bunShims("/Apps/Ray's/raypx", "darwin")).toEqual({
    bun: `#!/bin/sh\nBUN_BE_BUN=1 exec '/Apps/Ray'\\''s/raypx' "$@"\n`,
    bunx: `#!/bin/sh\nBUN_BE_BUN=1 exec '/Apps/Ray'\\''s/raypx' x "$@"\n`,
  });
});

it("keeps Windows wrappers ASCII and scopes the embedded runtime variable", () => {
  const shims = bunShims("C:\\中文 # 100%\\raypx.exe", "win32");
  for (const content of Object.values(shims)) {
    expect(content).toMatch(/^@setlocal\r\n@set BUN_BE_BUN=1\r\n/);
    expect(content).toMatch(/@"%~dp0runtime-[a-f0-9]{16}\\raypx\.exe"/);
    expect(Buffer.byteLength(content, "utf8")).toBe(content.length);
  }
  expect(shims["bunx.cmd"]).toContain('raypx.exe" x %*');
  for (const path of ["C:\\Raypx\\100%.exe", 'C:\\"\\raypx.exe'])
    expect(() => bunShims(path, "win32")).toThrow("cannot be quoted");
});

it("appends the shim directory once so an installed Bun keeps precedence", () => {
  const directory = join(temporary(), "bun");
  const bun = new BundledBun(directory, "/opt/raypx/raypx", "darwin");
  const environment = bun.environment({ PATH: "/usr/local/bin:/usr/bin", HOME: "/home/user" });
  expect(environment).toEqual({
    PATH: `/usr/local/bin:/usr/bin:${directory}`,
    HOME: "/home/user",
  });
  expect(bun.environment(environment)).toEqual(environment);
  expect(bun.environment({}).PATH).toBe(directory);
  expect(bun.path).toBe(join(directory, "bun"));
  expect(statSync(join(directory, "bunx")).mode & 0o111).not.toBe(0);
});

it("keeps the inherited Windows Path spelling", () => {
  const root = temporary();
  const directory = join(root, "bun");
  const executable = join(root, "raypx.exe");
  writeFileSync(executable, "synthetic runtime");
  const bun = new BundledBun(directory, executable, "win32");
  expect(bun.environment({ Path: "C:\\Windows" })).toEqual({
    Path: `C:\\Windows;${directory}`,
  });
  expect(bun.path).toBe(join(directory, "bun.cmd"));
});

it("links the complete runtime through Unicode paths and preserves unexpected directories", () => {
  const root = temporary();
  const source = join(root, "中文 # distribution");
  mkdirSync(source);
  const executable = join(source, "raypx.exe");
  writeFileSync(executable, "synthetic runtime");
  writeFileSync(join(source, "runtime.json"), "synthetic inventory");
  const directory = join(root, "中文 # profile", "bun");
  const bun = new BundledBun(directory, executable, "win32");
  expect(bun.ensure()).toBe(true);
  expect(bun.ensure()).toBe(true);
  const link = join(
    directory,
    readdirSync(directory).find((name) => name.startsWith("runtime-"))!,
  );
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(realpathSync(link)).toBe(realpathSync(source));
  expect(readFileSync(join(link, "runtime.json"), "utf8")).toBe("synthetic inventory");
  const content = readFileSync(bun.path, "utf8");
  expect(Buffer.byteLength(content, "utf8")).toBe(content.length);
  rmSync(link, { recursive: true });
  mkdirSync(link);
  const base = { Path: "C:\\Windows" };
  expect(bun.environment(base)).toBe(base);
  expect(lstatSync(link).isDirectory()).toBe(true);
});

it("rewrites only changed shims and leaves PATH alone when it cannot write them", () => {
  const root = temporary();
  const directory = join(root, "bun");
  expect(new BundledBun(directory, "/old/raypx", "darwin").ensure()).toBe(true);
  const unchanged = statSync(join(directory, "bun")).mtimeMs;
  expect(new BundledBun(directory, "/old/raypx", "darwin").ensure()).toBe(true);
  expect(statSync(join(directory, "bun")).mtimeMs).toBe(unchanged);
  expect(new BundledBun(directory, "/new/raypx", "darwin").ensure()).toBe(true);
  expect(readFileSync(join(directory, "bun"), "utf8")).toContain("'/new/raypx'");

  const blocked = join(root, "file");
  writeFileSync(blocked, "");
  const base = { PATH: "/usr/bin" };
  expect(new BundledBun(join(blocked, "bun"), "/opt/raypx", "darwin").environment(base)).toBe(base);
});
