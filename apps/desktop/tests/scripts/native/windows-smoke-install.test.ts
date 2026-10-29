import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import {
  installWindowsSmoke,
  type SmokeRegistration,
  type WindowsSmokeCommands,
} from "../../../scripts/native/windows-smoke-install";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "raypx-mygo-install-"));
  roots.push(root);
  const target = join(root, "build/native-smoke/windows-amd64");
  const cli = join(root, "cli/raypx.exe");
  const main = join(target, "Raypx Test.exe");
  const installer = join(target, "raypx-test-setup-0.1.0-amd64.exe");
  await mkdir(join(target, "bin"), { recursive: true });
  await mkdir(dirname(cli));
  await writeFile(cli, "compiled CLI");
  await copyFile(cli, join(target, "bin/raypx.exe"));
  await writeFile(main, "compiled MyGo smoke host");
  await writeFile(installer, "smoke NSIS");
  let entries: SmokeRegistration[] = [];
  let directory = "";
  let corrupt = false;
  let uninstallFails = false;
  const calls: string[] = [];
  const commands: WindowsSmokeCommands = {
    async registrations() {
      return structuredClone(entries);
    },
    async clearProduct() {},
    async execute(file, args) {
      calls.push(file);
      if (file === installer) {
        expect(args.startsWith("/S /D=")).toBe(true);
        directory = args.slice("/S /D=".length);
        roots.push(dirname(directory));
        await mkdir(join(directory, "bin"), { recursive: true });
        await copyFile(main, join(directory, "Raypx Test.exe"));
        await writeFile(
          join(directory, "bin/raypx.exe"),
          corrupt ? "stale CLI" : await readFile(cli),
        );
        await writeFile(join(directory, "Uninstall.exe"), "owned uninstaller");
        entries = [
          {
            hive: "CurrentUser",
            view: "Registry64",
            product: false,
            uninstall: true,
            productLocation: null,
            installLocation: directory,
          },
        ];
      } else {
        expect(file).toBe(join(directory, "Uninstall.exe"));
        expect(args).toBe(`/S _?=${directory}`);
        if (uninstallFails) throw Error("uninstall failed");
        entries = [];
      }
    },
  };
  return {
    root,
    target,
    cli,
    main,
    installer,
    calls,
    commands,
    entries: (value: SmokeRegistration[]) => (entries = value),
    corrupt: () => (corrupt = true),
    uninstallFails: () => (uninstallFails = true),
  };
}
it("installs the actual test package, verifies payload hashes and disposes once", async () => {
  const f = await fixture();
  const installed = await installWindowsSmoke(f.target, f.cli, {
    arch: "x64",
    commands: f.commands,
  });
  expect(await readFile(installed.binary, "utf8")).toBe("compiled MyGo smoke host");
  await installed.dispose();
  await installed.dispose();
  expect(existsSync(installed.binary)).toBe(false);
  expect(f.calls).toHaveLength(2);
});
it("refuses to overwrite an existing registered installation", async () => {
  const f = await fixture();
  f.entries([
    {
      hive: "CurrentUser",
      view: "Registry64",
      product: false,
      uninstall: true,
      productLocation: null,
      installLocation: "existing",
    },
  ]);
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("Existing");
  expect(f.calls).toEqual([]);
});
it("rejects a packaged CLI that differs from the selected build before installation", async () => {
  const f = await fixture();
  await writeFile(join(f.target, "bin/raypx.exe"), "old CLI");
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("differs");
  expect(f.calls).toEqual([]);
});
it("rejects installed payload corruption and still uninstalls the owned package", async () => {
  const f = await fixture();
  f.corrupt();
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("differs");
  expect(f.calls).toHaveLength(2);
});
it("preserves an installation whose registry ownership has changed", async () => {
  const f = await fixture();
  const installed = await installWindowsSmoke(f.target, f.cli, {
    arch: "x64",
    commands: f.commands,
  });
  f.entries([
    {
      hive: "LocalMachine",
      view: "Registry64",
      product: false,
      uninstall: true,
      productLocation: null,
      installLocation: dirname(installed.binary),
    },
  ]);
  await expect(installed.dispose()).rejects.toThrow("changed ownership");
  expect(existsSync(installed.binary)).toBe(true);
});
it("reports failed uninstall without deleting recovery evidence", async () => {
  const f = await fixture();
  const installed = await installWindowsSmoke(f.target, f.cli, {
    arch: "x64",
    commands: f.commands,
  });
  f.uninstallFails();
  await expect(installed.dispose()).rejects.toThrow("uninstall failed");
  expect(existsSync(installed.binary)).toBe(true);
});
it("rejects production paths and substituted executable symlinks", async () => {
  const f = await fixture();
  await expect(
    installWindowsSmoke(join(f.root, "release"), f.cli, { commands: f.commands }),
  ).rejects.toThrow("native-smoke");
  await rm(f.main);
  await symlink(f.cli, f.main);
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("Unsafe smoke executable");
  expect(f.calls).toEqual([]);
});
