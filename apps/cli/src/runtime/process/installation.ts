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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cliBuild } from "../daemon/build.js";
import { LocalError } from "../errors.js";

export interface InstallationManifest {
  format: 2;
  commit: string;
  platform: string;
  arch: string;
  version: string;
  builtAt: number;
  bunVersion: string;
  files: Record<string, string>;
}
const suffix = process.platform === "win32" ? ".exe" : "";
export function cliInstallation() {
  const bundled = cliBuild.builtAt > 0;
  let root = bundled ? dirname(process.execPath) : resolve(import.meta.dirname, "../../..");
  // Stable connector executable is an owned copy; resolve its complete immutable payload.
  if (bundled && !existsSync(join(root, "runtime.json"))) {
    const ownership = JSON.parse(readFileSync(join(root, "installation.json"), "utf8"));
    if (
      !/^versions\/[a-zA-Z0-9_.-]+$/.test(ownership.directory) ||
      ownership.version !== cliBuild.version ||
      ownership.builtAt !== cliBuild.builtAt ||
      ownership.digest !== createHash("sha256").update(readFileSync(process.execPath)).digest("hex")
    )
      throw new LocalError("INSTALLATION_CONFLICT", "Invalid connector installation");
    root = join(root, ownership.directory);
  }
  return { root, bundled, launcher: bundled ? process.execPath : null };
}
export function cliLaunch() {
  return cliInstallation().bundled ? [process.execPath] : [process.execPath, Bun.main];
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
    manifest.format !== 2 ||
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch ||
    typeof manifest.bunVersion !== "string"
  )
    throw new LocalError("HOST_VERSION_MISMATCH", "CLI resources do not match this build");
  for (const required of ["raypx" + suffix, "LICENSE", "README.txt"])
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
