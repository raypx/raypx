import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const root = await mkdtemp(join(tmpdir(), "raypx-nsis-fixture-"));
  roots.push(root);
  const target = join(root, "target/native-smoke");
  const script = join(target, "release/nsis/x64/installer.nsi");
  const installer = join(target, "release/bundle/nsis/Raypx Test_0.1.0_x64-setup.exe");
  const main = join(target, "release/raypx-desktop.exe");
  const cli = join(root, "apps/cli/dist/raypx.exe");
  const stagedCli = join(root, "apps/desktop/src-tauri/binaries/raypx-x86_64-pc-windows-msvc.exe");
  await mkdir(dirname(script), { recursive: true });
  await mkdir(dirname(installer), { recursive: true });
  await mkdir(dirname(cli), { recursive: true });
  await mkdir(dirname(stagedCli), { recursive: true });
  const source = [
    '!define MANUFACTURER "raypx"',
    '!define PRODUCTNAME "Raypx Test"',
    '!define VERSION "0.1.0"',
    '!define BUNDLEID "com.raypx.desktop.native-smoke"',
    '!define INSTALLMODE "currentUser"',
    '!define MAINBINARYNAME "raypx-desktop"',
    `!define MAINBINARYSRCPATH "${main}"`,
    '!define ARCH "x64"',
    'File "${MAINBINARYSRCPATH}"',
    `File /a "/oname=raypx.exe" "${stagedCli}"`,
  ].join("\r\n");
  await writeFile(script, source);
  await writeFile(installer, "NSIS fixture");
  const mainContents =
    "compiled release smoke main __TAURI_BUNDLE_TYPE_VAR_UNK another __TAURI_BUNDLE_TYPE_VAR_UNK";
  await writeFile(main, mainContents);
  await writeFile(cli, "compiled bundled CLI");
  await copyFile(cli, stagedCli);
  const calls: { file: string; arguments: string }[] = [];
  let entries: SmokeRegistration[] = [];
  let directory = "";
  let corruptSidecar = false;
  let failInstall = false;
  let failUninstall = false;
  const commands: WindowsSmokeCommands = {
    async registrations(keys) {
      expect(keys).toEqual({
        product: "Software\\raypx\\Raypx Test",
        uninstall: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Raypx Test",
      });
      return structuredClone(entries);
    },
    async execute(file, rawArguments) {
      calls.push({ file, arguments: rawArguments });
      if (file === installer) {
        expect(rawArguments.startsWith("/S /NS /D=")).toBe(true);
        directory = rawArguments.slice("/S /NS /D=".length);
        roots.push(dirname(directory));
        await mkdir(directory);
        // Tauri patches the first bundle-type token before NSIS captures the main
        // payload, then restores the Cargo source once packaging completes.
        await writeFile(
          join(directory, "raypx-desktop.exe"),
          (await readFile(main, "utf8")).replace(
            "__TAURI_BUNDLE_TYPE_VAR_UNK",
            "__TAURI_BUNDLE_TYPE_VAR_NSS",
          ),
        );
        await writeFile(
          join(directory, "raypx.exe"),
          corruptSidecar ? "stale CLI" : await readFile(cli),
        );
        await writeFile(join(directory, "uninstall.exe"), "owned uninstaller");
        // Windows can expose the same HKCU key through both registry views.
        entries = ["Registry32", "Registry64"].map((view) => ({
          hive: "CurrentUser",
          view: view as SmokeRegistration["view"],
          product: true,
          uninstall: true,
          productLocation: directory,
          // Tauri's NSIS template writes InstallLocation with surrounding quotes.
          installLocation: `"${directory}"`,
        }));
        if (failInstall) throw new Error("installer failed after writing files");
      } else {
        expect(file).toBe(join(directory, "uninstall.exe"));
        expect(rawArguments).toBe(`/S _?=${directory}`);
        if (failUninstall) throw new Error("uninstaller busy");
        entries = entries.map((entry) => ({ ...entry, uninstall: false, installLocation: null }));
        await rm(join(directory, "raypx-desktop.exe"));
        await rm(join(directory, "raypx.exe"));
      }
    },
    async clearProduct(_keys, ownedDirectory) {
      expect(ownedDirectory).toBe(directory);
      expect(entries.every((entry) => entry.productLocation === directory)).toBe(true);
      entries = [];
    },
  };
  return {
    target,
    main,
    mainContents,
    cli,
    stagedCli,
    script,
    source,
    installer,
    calls,
    commands,
    directory: () => directory,
    entries: () => entries,
    setEntries: (value: SmokeRegistration[]) => (entries = value),
    corrupt: () => (corruptSidecar = true),
    failInstall: () => (failInstall = true),
    failUninstall: () => (failUninstall = true),
  };
}

it("runs the installed main/sidecar and uninstalls the owned per-user package after all phases", async () => {
  const f = await fixture();
  const app = await installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands });
  expect(app.binary).toBe(join(f.directory(), "raypx-desktop.exe"));
  expect(await readFile(app.binary, "utf8")).toBe(
    f.mainContents.replace("__TAURI_BUNDLE_TYPE_VAR_UNK", "__TAURI_BUNDLE_TYPE_VAR_NSS"),
  );
  expect(await readFile(f.main, "utf8")).toBe(f.mainContents);
  expect(existsSync(join(f.directory(), "raypx.exe"))).toBe(true);
  expect(f.calls).toEqual([{ file: f.installer, arguments: `/S /NS /D=${f.directory()}` }]);
  expect(f.directory()).toContain("Raypx Test");
  await app.dispose();
  await app.dispose();
  expect(f.calls).toHaveLength(2);
  expect(existsSync(dirname(f.directory()))).toBe(false);
  expect(f.entries()).toEqual([]);
});

it("preserves an existing smoke installation and never runs the installer", async () => {
  const f = await fixture();
  f.setEntries([
    {
      hive: "CurrentUser",
      view: "Registry64",
      product: true,
      uninstall: true,
      productLocation: "C:\\existing-smoke",
      installLocation: "C:\\existing-smoke",
    },
  ]);
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("Existing Raypx Test installation");
  expect(f.calls).toEqual([]);
  expect(f.entries()[0]!.installLocation).toBe("C:\\existing-smoke");
});

it.each([
  ['PRODUCTNAME "Raypx Test"', 'PRODUCTNAME "Raypx"'],
  ['BUNDLEID "com.raypx.desktop.native-smoke"', 'BUNDLEID "com.raypx.desktop"'],
  ['INSTALLMODE "currentUser"', 'INSTALLMODE "perMachine"'],
])("rejects production identity or a machine-wide installer", async (before, after) => {
  const f = await fixture();
  await writeFile(f.script, f.source.replace(before, after));
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("per-user native-smoke identity");
  expect(f.calls).toEqual([]);
});

it("refuses ambiguous installers instead of choosing by modification time", async () => {
  const f = await fixture();
  await writeFile(join(dirname(f.installer), "old-setup.exe"), "stale NSIS");
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("ambiguous native-smoke NSIS installer");
  expect(f.calls).toEqual([]);
});

it.each(["corrupt", "failInstall"] as const)(
  "uninstalls partial or stale packages before returning an installation failure: %s",
  async (failure) => {
    const f = await fixture();
    f[failure]();
    await expect(
      installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
    ).rejects.toThrow(
      failure === "corrupt" ? "differs from the packaged build" : "installer failed",
    );
    expect(f.calls).toHaveLength(2);
    expect(existsSync(dirname(f.directory()))).toBe(false);
    expect(f.entries()).toEqual([]);
  },
);

it("retains evidence if uninstall fails and never erases its registration", async () => {
  const f = await fixture();
  const app = await installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands });
  f.failUninstall();
  await expect(app.dispose()).rejects.toThrow("uninstaller busy");
  expect(existsSync(app.binary)).toBe(true);
  expect(f.entries().every((entry) => entry.uninstall)).toBe(true);
});

it("does not uninstall or delete registrations after ownership changes", async () => {
  const f = await fixture();
  const app = await installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands });
  f.setEntries(f.entries().map((entry) => ({ ...entry, installLocation: "C:\\other-install" })));
  await expect(app.dispose()).rejects.toThrow("changed ownership");
  expect(f.calls).toHaveLength(1);
  expect(existsSync(app.binary)).toBe(true);
  expect(f.entries()[0]!.installLocation).toBe("C:\\other-install");
});

it("rejects a machine-wide install and retains it rather than running an unsafe uninstall", async () => {
  const f = await fixture();
  const execute = f.commands.execute.bind(f.commands);
  f.commands.execute = async (file, args) => {
    await execute(file, args);
    f.setEntries(f.entries().map((entry) => ({ ...entry, hive: "LocalMachine" })));
  };
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow("Smoke installation failed; retained");
  expect(f.calls).toHaveLength(1);
  expect(f.entries()[0]!.hive).toBe("LocalMachine");
});

it("accepts a shared product key visible without the uninstall key in the other registry view", async () => {
  const f = await fixture();
  const execute = f.commands.execute.bind(f.commands);
  f.commands.execute = async (file, args) => {
    await execute(file, args);
    if (file === f.installer)
      f.setEntries(
        f
          .entries()
          .map((entry) =>
            entry.view === "Registry32"
              ? { ...entry, uninstall: false, installLocation: null }
              : entry,
          ),
      );
  };
  const app = await installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands });
  await app.dispose();
  expect(f.entries()).toEqual([]);
  expect(existsSync(dirname(f.directory()))).toBe(false);
});

it.each(["unpatched", "MSI", "all tokens", "other code"])(
  "rejects an installed main executable with unexpected bytes: %s",
  async (change) => {
    const f = await fixture();
    const execute = f.commands.execute.bind(f.commands);
    f.commands.execute = async (file, args) => {
      await execute(file, args);
      if (file !== f.installer) return;
      const path = join(f.directory(), "raypx-desktop.exe");
      const installed = await readFile(path, "utf8");
      const changed =
        change === "unpatched"
          ? installed.replace("__TAURI_BUNDLE_TYPE_VAR_NSS", "__TAURI_BUNDLE_TYPE_VAR_UNK")
          : change === "MSI"
            ? installed.replace("__TAURI_BUNDLE_TYPE_VAR_NSS", "__TAURI_BUNDLE_TYPE_VAR_MSI")
            : change === "all tokens"
              ? installed.replaceAll("__TAURI_BUNDLE_TYPE_VAR_UNK", "__TAURI_BUNDLE_TYPE_VAR_NSS")
              : installed.replace("compiled release", "modified release");
      await writeFile(path, changed);
    };
    await expect(
      installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
    ).rejects.toThrow(/differs from the packaged build: .*"main":.*"size":.*"sha256":/);
    expect(f.calls).toHaveLength(2);
    expect(existsSync(dirname(f.directory()))).toBe(false);
    expect(await readFile(f.main, "utf8")).toBe(f.mainContents);
  },
);

it.each(["missing", "NSS", "MSI"])(
  "refuses a source main without the original Tauri bundle-type token: %s",
  async (token) => {
    const f = await fixture();
    await writeFile(f.main, token === "missing" ? "no token" : `__TAURI_BUNDLE_TYPE_VAR_${token}`);
    await expect(
      installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
    ).rejects.toThrow("Missing Tauri bundle-type token");
    expect(f.calls).toEqual([]);
  },
);

it("detects a stale staged CLI before installing, with payload/build hashes and paths", async () => {
  const f = await fixture();
  await writeFile(f.stagedCli, "stale staged CLI");
  await expect(
    installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
  ).rejects.toThrow(/Staged NSIS CLI payload differs.*"payload":.*"path":.*"sha256":.*"build":/);
  expect(f.calls).toEqual([]);
});

it.each(["main", "cli"])(
  "rejects an NSIS script referring to an unintended payload: %s",
  async (payload) => {
    const f = await fixture();
    await writeFile(
      f.script,
      payload === "main" ? f.source.replace(f.main, f.cli) : f.source.replace(f.stagedCli, f.cli),
    );
    await expect(
      installWindowsSmoke(f.target, f.cli, { arch: "x64", commands: f.commands }),
    ).rejects.toThrow(payload === "main" ? "NSIS main payload source" : "NSIS CLI payload source");
    expect(f.calls).toEqual([]);
  },
);
