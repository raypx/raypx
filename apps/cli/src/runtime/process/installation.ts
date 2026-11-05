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
import { fileURLToPath } from "node:url";
import { cliBuild } from "../daemon/build.ts";
import { LocalError } from "../errors.ts";

export interface InstallationManifest {
  version: string;
  builtAt: number;
  nodeVersion: string;
  pnpmVersion: string;
  files: Record<string, string>;
}
const suffix = process.platform === "win32" ? ".exe" : "";
export function cliInstallation() {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = existsSync(join(here, "runtime.json"));
  return {
    root: bundled ? here : resolve(here, "../../.."),
    bundled,
    node: bundled ? join(here, "runtime", "node" + suffix) : process.execPath,
    entry: bundled ? join(here, "main.mjs") : resolve(here, "../../main.ts"),
    launcher: bundled ? join(here, "raypx" + suffix) : null,
    pnpm: bundled ? join(here, "runtime/pnpm/pnpm" + suffix) : null,
  };
}
export function cliLaunch() {
  const layout = cliInstallation();
  return layout.bundled
    ? [layout.node, layout.entry]
    : [layout.node, "--import", import.meta.resolve("tsx"), layout.entry];
}
export function verifyInstallation(
  root: string,
  expected: { version: string; builtAt: number } | null = cliBuild,
): InstallationManifest {
  const manifest = JSON.parse(
    readFileSync(join(root, "runtime.json"), "utf8"),
  ) as InstallationManifest;
  if (
    (expected !== null &&
      (manifest.version !== expected.version || manifest.builtAt !== expected.builtAt)) ||
    !manifest.files ||
    typeof manifest.nodeVersion !== "string" ||
    typeof manifest.pnpmVersion !== "string"
  )
    throw new LocalError("HOST_VERSION_MISMATCH", "CLI resources do not match this build");
  for (const required of [
    "main.mjs",
    "raypx" + suffix,
    "runtime/node" + suffix,
    "runtime/pnpm/pnpm" + suffix,
    "runtime/pnpm/" + (process.platform === "win32" ? "pnpx.cmd" : "pnpx"),
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
