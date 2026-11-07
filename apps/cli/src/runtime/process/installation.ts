import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  lstatSync,
  rmSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cliBuild, cliExternalBun } from "../daemon/build.ts";
import { LocalError } from "../errors.ts";

export interface InstallationManifest {
  format: 1;
  commit: string;
  platform: string;
  arch: string;
  version: string;
  builtAt: number;
  bunVersion: string;
  herdrVersion: string;
  files: Record<string, string>;
}
const suffix = process.platform === "win32" ? ".exe" : "";
const splitLauncher = cliExternalBun ? process.env.RAYPX_SPLIT_LAUNCHER : undefined;
if (cliExternalBun) delete process.env.RAYPX_SPLIT_LAUNCHER;

/** Raypx's launcher and Bun's executable differ in the opt-in split distribution. */
export function resolveInstallation(
  executable: string,
  build = cliBuild,
  externalLauncher?: string,
) {
  const bundled = build.builtAt > 0;
  let root = bundled ? dirname(executable) : resolve(import.meta.dirname, "../../..");
  const launcher = bundled ? (externalLauncher ?? executable) : null;
  if (externalLauncher) {
    if (
      !bundled ||
      !isAbsolute(externalLauncher) ||
      basename(externalLauncher) !== "raypx" + suffix ||
      basename(executable) !== "bun" + suffix ||
      !existsSync(join(root, "cli.js")) ||
      !lstatSync(join(root, "cli.js")).isFile() ||
      !lstatSync(externalLauncher).isFile()
    )
      throw new LocalError("INSTALLATION_CONFLICT", "Invalid external Bun installation");
  }
  const launcherRoot = launcher ? dirname(launcher) : root;
  // Stable connector executable is an owned copy; resolve its complete immutable payload.
  if (bundled && !existsSync(join(launcherRoot, "runtime.json"))) {
    const ownership = JSON.parse(readFileSync(join(launcherRoot, "installation.json"), "utf8"));
    if (
      !/^versions\/[a-zA-Z0-9_.-]+$/.test(ownership.directory) ||
      ownership.version !== build.version ||
      ownership.builtAt !== build.builtAt ||
      ownership.digest !== createHash("sha256").update(readFileSync(launcher!)).digest("hex") ||
      (externalLauncher && resolve(root) !== resolve(launcherRoot, ownership.directory))
    )
      throw new LocalError("INSTALLATION_CONFLICT", "Invalid connector installation");
    root = join(launcherRoot, ownership.directory);
  }
  if (
    externalLauncher &&
    resolve(launcherRoot) !== resolve(root) &&
    existsSync(join(launcherRoot, "runtime.json"))
  )
    throw new LocalError("INSTALLATION_CONFLICT", "External Bun belongs to another installation");
  return { root, bundled, launcher, bunExecutable: executable };
}
export function cliInstallation() {
  if (cliExternalBun && !splitLauncher)
    throw new LocalError("INSTALLATION_CONFLICT", "External Bun requires its Raypx launcher");
  return resolveInstallation(process.execPath, cliBuild, splitLauncher);
}
export function cliLaunch() {
  const layout = cliInstallation();
  return layout.launcher ? [layout.launcher] : [layout.bunExecutable, Bun.main];
}
export function verifyInstallation(
  root: string,
  expected: { version: string; builtAt: number } | null = cliBuild,
): InstallationManifest {
  if (!lstatSync(join(root, "runtime.json")).isFile())
    throw new LocalError("INSTALLATION_CONFLICT", "Invalid CLI runtime manifest");
  const manifest = JSON.parse(
    readFileSync(join(root, "runtime.json"), "utf8"),
  ) as InstallationManifest;
  if (
    (expected !== null &&
      (manifest.version !== expected.version || manifest.builtAt !== expected.builtAt)) ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files) ||
    !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    !Number.isSafeInteger(manifest.builtAt) ||
    manifest.builtAt <= 0 ||
    typeof manifest.version !== "string" ||
    manifest.format !== 1 ||
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch ||
    typeof manifest.bunVersion !== "string" ||
    typeof manifest.herdrVersion !== "string"
  )
    throw new LocalError("HOST_VERSION_MISMATCH", "CLI resources do not match this build");
  for (const required of [
    "raypx" + suffix,
    "herdr/runtime.json",
    "LICENSE",
    "README.txt",
    ...(cliExternalBun ? ["bun" + suffix, "cli.js"] : []),
  ])
    if (!manifest.files[required])
      throw new LocalError("INSTALLATION_CONFLICT", "Incomplete CLI runtime manifest");
  const found = new Set<string>();
  function walk(directory: string, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (name === "runtime.json") continue;
      if (entry.isDirectory()) walk(join(directory, entry.name), name + "/");
      else if (entry.isFile()) found.add(name);
      else throw new LocalError("INSTALLATION_CONFLICT", "Unsupported CLI runtime resource");
    }
  }
  walk(root);
  if (found.size !== Object.keys(manifest.files).length)
    throw new LocalError("INSTALLATION_CONFLICT", "CLI runtime resources changed");
  for (const [name, hash] of Object.entries(manifest.files)) {
    const file = resolve(root, name),
      local = relative(root, file);
    if (
      !found.has(name) ||
      !lstatSync(file).isFile() ||
      isAbsolute(name) ||
      local === ".." ||
      local.startsWith(".." + sep) ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      createHash("sha256").update(readFileSync(file)).digest("hex") !== hash
    )
      throw new LocalError("INSTALLATION_CONFLICT", "CLI resources changed outside Raypx");
  }
  return manifest;
}
/** Immutable, complete runtime copies keep Windows updaters independent of running owners. */
export function installRuntimeCopy(source: string, parent: string) {
  verifyInstallation(source);
  const target = join(parent, `${cliBuild.version}-${cliBuild.builtAt}`);
  if (resolve(source) === resolve(target)) return target;
  if (!existsSync(target)) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const temporary = target + "." + crypto.randomUUID() + ".tmp";
    try {
      cpSync(source, temporary, { recursive: true, errorOnExist: true, force: false });
      verifyInstallation(temporary);
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  verifyInstallation(target);
  return target;
}
