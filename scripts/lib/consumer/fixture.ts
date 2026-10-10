import { cp, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JSONC } from "bun";
import { scriptLogger } from "../logger.ts";
import { run } from "../process.ts";
import { assertLockedGraph, projectLock, registrySpec, type Lock } from "./lock.ts";
import { condition, entries, json, object, strings, write, type Manifest } from "./manifest.ts";

export const repository = fileURLToPath(new URL("../../../", import.meta.url));
export interface ConsumerFixture {
  directory: string;
  packages: Map<string, Manifest>;
  cleanup(): Promise<void>;
}

/** Copy only runtime and declared tooling assets, then validate public export targets. */
async function copyArtifact(name: string, directory: string, original: Lock): Promise<Manifest> {
  const source = join(repository, "packages", name);
  const raw = await json(join(source, "package.json"));
  if (typeof raw.name !== "string" || typeof raw.version !== "string")
    throw new Error(`Invalid package manifest: ${name}`);
  const manifest = { ...raw, exports: object(raw.exports) } as Manifest;
  const artifact = join(directory, "artifacts", name);
  await mkdir(artifact, { recursive: true });
  // config intentionally exports TS tools; UI's shadcn condition exports source assets.
  if (name !== "config")
    await cp(join(source, "dist"), join(artifact, "dist"), { recursive: true });
  if (name === "ui" || name === "config")
    await cp(join(source, "src"), join(artifact, "src"), { recursive: true });
  if (name === "config")
    await cp(join(source, "tsconfig-presets"), join(artifact, "tsconfig-presets"), {
      recursive: true,
    });
  if (name === "db")
    await cp(join(source, "migrations"), join(artifact, "migrations"), { recursive: true });
  if (name === "ui")
    await cp(join(source, "SHADCN_LICENSE.md"), join(artifact, "SHADCN_LICENSE.md"));
  const dependencies = strings(manifest.dependencies);
  for (const [dependency, version] of Object.entries(dependencies)) {
    dependencies[dependency] = version.startsWith("workspace:")
      ? `file:../${dependency.split("/")[1]}`
      : registrySpec(dependency, original);
  }
  delete manifest.devDependencies;
  delete manifest.scripts;
  manifest.dependencies = dependencies;
  await write(join(artifact, "package.json"), manifest);
  for (const [subpath, value] of entries(manifest)) {
    if (subpath.includes("*")) continue;
    for (const target of [
      condition(value, "import"),
      condition(value, "types"),
      condition(value, "shadcn"),
    ]) {
      if (!target) continue;
      const resolved = await realpath(join(artifact, target));
      if (!resolved.startsWith(artifact + sep))
        throw new Error(`Public asset escapes fixture: ${manifest.name} ${subpath}`);
    }
  }
  return manifest;
}

/** Builds a fresh, repository-independent installation from public package artifacts. */
export async function createFixture(kind: "core" | "server" | "browser"): Promise<ConsumerFixture> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), `raypx-consumer-${kind}-`)));
  const packages = new Map<string, Manifest>();
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    const original = JSONC.parse(await readFile(join(repository, "bun.lock"), "utf8")) as Lock;
    const requested =
      kind === "core"
        ? ["client", "contracts", "env"]
        : kind === "browser"
          ? ["ui", "client", "contracts", "env"]
          : [
              "api",
              "auth",
              "client",
              "config",
              "contracts",
              "db",
              "env",
              "logger",
              "storage",
              "ui",
              "worker",
            ];
    for (const name of requested) {
      const manifest = await copyArtifact(name, directory, original);
      packages.set(manifest.name, manifest);
    }
    const dependencies = Object.fromEntries(
      [...packages].map(([name]) => [name, `file:./artifacts/${name.split("/")[1]}`]),
    );
    const tools =
      kind === "core"
        ? ["typescript", "@types/node"]
        : [
            "typescript",
            "@types/node",
            "@types/react",
            "@types/react-dom",
            "react",
            "react-dom",
            "@tanstack/react-query",
            "vite",
            "vite-plus",
            "@vitejs/plugin-react",
            "@tailwindcss/vite",
            "tailwindcss",
            "tw-animate-css",
          ];
    for (const name of tools) dependencies[name] = registrySpec(name, original);
    const manifest = {
      name: `raypx-consumer-${kind}`,
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies,
      trustedDependencies: kind === "server" ? ["better-sqlite3"] : [],
    };
    await write(join(directory, "package.json"), manifest);
    const seed = projectLock(original, manifest, packages);
    await write(join(directory, "bun.lock"), seed);
    const peerPolicy = kind === "core" ? ["--omit", "peer"] : [];
    await run("bun", ["install", "--lockfile-only", "--offline", ...peerPolicy], directory);
    const normalized = JSONC.parse(await readFile(join(directory, "bun.lock"), "utf8")) as Lock;
    assertLockedGraph(original, normalized);
    await run(
      "bun",
      ["install", "--frozen-lockfile", ...peerPolicy, "--prefer-offline"],
      directory,
    );
    scriptLogger.success(`Consumer ${kind}: installed locked artifacts outside repository`);
    return { directory, packages, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
