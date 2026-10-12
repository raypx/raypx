import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { build } from "esbuild";

const nodeVersion = "24.18.0";
interface PackageManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}
export function nodeArtifact(platform: string, architecture: string) {
  const systems: Record<string, string> = { darwin: "darwin", win32: "win", linux: "linux" };
  const os = systems[platform];
  if (!os || !["arm64", "x64"].includes(architecture))
    throw new Error("Unsupported desktop runner target.");
  const base = `node-v${nodeVersion}-${os}-${architecture}`;
  return {
    base,
    filename: `${base}.${platform === "win32" ? "zip" : "tar.gz"}`,
    executable: platform === "win32" ? "node.exe" : "bin/node",
  };
}
async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function execute(command: string, args: string[]): Promise<void> {
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? done() : reject(new Error(`${command} exited ${code}.`)),
    );
  });
}
async function findPackage(name: string, from: string): Promise<string | null> {
  let current = resolve(from);
  while (true) {
    const candidate = join(current, "node_modules", name);
    if (await exists(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Copy the installed dependency closure, retaining version conflicts in nested node_modules. */
export async function copyPackageClosure(source: string, modules: string): Promise<void> {
  const installed = new Set<string>();
  const install = async (packageSource: string, destination: string): Promise<void> => {
    if (installed.has(destination)) return;
    installed.add(destination);
    const canonical = await realpath(packageSource);
    const manifest = JSON.parse(
      await readFile(join(canonical, "package.json"), "utf8"),
    ) as PackageManifest;
    await mkdir(dirname(destination), { recursive: true });
    await cp(canonical, destination, {
      recursive: true,
      dereference: true,
      filter: (path) => path !== join(canonical, "node_modules"),
    });
    const dependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}).filter(
        (name) => !manifest.peerDependenciesMeta?.[name]?.optional,
      ),
    ]);
    for (const name of dependencies) {
      const dependency = await findPackage(name, canonical);
      if (!dependency) {
        if (manifest.optionalDependencies?.[name]) continue;
        throw new Error(`Runner dependency is not installed: ${name}`);
      }
      const desired = JSON.parse(
        await readFile(join(dependency, "package.json"), "utf8"),
      ) as PackageManifest;
      const available = await findPackage(name, destination);
      if (available) {
        const current = JSON.parse(
          await readFile(join(available, "package.json"), "utf8"),
        ) as PackageManifest;
        if (current.version === desired.version) continue;
      }
      const root = join(modules, name);
      await install(
        dependency,
        (await exists(join(root, "package.json"))) ? join(destination, "node_modules", name) : root,
      );
    }
  };
  const manifest = JSON.parse(
    await readFile(join(source, "package.json"), "utf8"),
  ) as PackageManifest;
  await install(source, join(modules, manifest.name));
}

export async function getDesktopNode(): Promise<string> {
  const artifact = nodeArtifact(process.platform, process.arch);
  const cache = join(homedir(), ".cache", "voidmix", "node", artifact.base);
  const executable = join(cache, artifact.base, artifact.executable);
  if (await exists(executable)) return executable;
  await mkdir(cache, { recursive: true });
  const baseUrl = `https://nodejs.org/dist/v${nodeVersion}`;
  const [checksumResponse, archiveResponse] = await Promise.all([
    fetch(`${baseUrl}/SHASUMS256.txt`, { signal: AbortSignal.timeout(60_000) }),
    fetch(`${baseUrl}/${artifact.filename}`, { signal: AbortSignal.timeout(120_000) }),
  ]);
  if (!checksumResponse.ok || !archiveResponse.ok)
    throw new Error(`Could not download pinned Node ${nodeVersion}.`);
  const line = (await checksumResponse.text())
    .split("\n")
    .find((item) => item.trim().endsWith(` ${artifact.filename}`));
  const expected = line?.trim().split(/\s+/)[0];
  const bytes = Buffer.from(await archiveResponse.arrayBuffer());
  if (!expected || createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("Node archive checksum mismatch.");
  const archive = join(cache, artifact.filename);
  await writeFile(archive, bytes);
  if (process.platform === "win32") {
    // Windows ships tar with ZIP support; arguments are passed without a shell.
    await execute("tar", ["-xf", archive, "-C", cache]);
  } else await execute("tar", ["-xzf", archive, "-C", cache]);
  if (!(await exists(executable)))
    throw new Error("Node archive does not contain the runner executable.");
  return executable;
}

export async function prepareDesktopRunner(
  repositoryRoot: string,
  log: (event: string) => void,
): Promise<void> {
  const output = join(repositoryRoot, "apps/desktop/src-tauri/runner");
  const node = await getDesktopNode();
  log("desktop.runner.node.ready");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const targetNode = join(output, process.platform === "win32" ? "node.exe" : "node");
  await copyFile(node, targetNode);
  if (process.platform !== "win32") await chmod(targetNode, 0o755);
  await build({
    absWorkingDir: repositoryRoot,
    entryPoints: ["apps/desktop/runtime/main.ts"],
    outfile: join(output, "main.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    packages: "bundle",
    external: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-coding-agent/*"],
  });
  const sdk = await findPackage(
    "@earendil-works/pi-coding-agent",
    join(repositoryRoot, "packages/ai"),
  );
  if (!sdk) throw new Error("Install the Pi SDK before preparing the Desktop runner.");
  await copyPackageClosure(sdk, join(output, "node_modules"));
  await writeFile(join(output, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await execute(targetNode, [
    "--input-type=module",
    "-e",
    "await import(process.argv[1]);",
    join(output, "node_modules/@earendil-works/pi-coding-agent/dist/index.js"),
  ]);
  log("desktop.runner.prepared");
}
