import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { BundledBun, bunShims } from "../../../../src/runtime/process/bun";

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

it("scopes the Windows variable with setlocal and refuses paths cmd cannot quote", () => {
  expect(bunShims("C:\\Raypx\\raypx.exe", "win32")).toEqual({
    "bun.cmd": '@setlocal\r\n@set BUN_BE_BUN=1\r\n@"C:\\Raypx\\raypx.exe" %*\r\n',
    "bunx.cmd": '@setlocal\r\n@set BUN_BE_BUN=1\r\n@"C:\\Raypx\\raypx.exe" x %*\r\n',
  });
  for (const path of ["C:\\100%\\raypx.exe", 'C:\\"\\raypx.exe'])
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
  const directory = join(temporary(), "bun");
  const bun = new BundledBun(directory, "C:\\Raypx\\raypx.exe", "win32");
  expect(bun.environment({ Path: "C:\\Windows" })).toEqual({
    Path: `C:\\Windows;${directory}`,
  });
  expect(bun.path).toBe(join(directory, "bun.cmd"));
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
