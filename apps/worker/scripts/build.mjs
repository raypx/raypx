import { build } from "esbuild";
import {
  readFile,
  cp,
  mkdir,
  rm,
  realpath,
  stat,
  writeFile,
  symlink,
  readdir,
} from "node:fs/promises";
import { basename, dirname, join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(workspace, "dist");
const external = new Map();
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const packageName = (specifier) =>
  specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
async function locate(name, start) {
  let current = start;
  while (true) {
    const candidate = join(current, "node_modules", name);
    try {
      if ((await stat(candidate)).isDirectory()) return await realpath(candidate);
    } catch {}
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Runtime dependency ${name} cannot be resolved from ${start}.`);
}
await mkdir(output, { recursive: true });
try {
  await stat(join(output, ".runtime-layout-v1"));
} catch {
  await rm(join(output, "node_modules"), { recursive: true, force: true });
}
export const bundleOptions = {
  entryPoints: {
    index: join(workspace, "src/main.ts"),
    runner: join(workspace, "src/runner-main.ts"),
  },
  outdir: output,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  metafile: true,
  plugins: [
    {
      name: "preserve-provider-assets",
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, async (args) => {
          if (builtins.has(args.path) || args.path.startsWith("node:"))
            return { path: args.path, external: true };
          if (args.path.startsWith("@voidmix/")) return;
          const name = packageName(args.path);
          const directory = await locate(name, args.resolveDir || workspace);
          external.set(directory, name);
          return { path: args.path, external: true };
        });
      },
    },
  ],
};
await build(bundleOptions);
const copied = new Map();
const store = join(output, "node_modules", ".store");
await mkdir(store, { recursive: true });
const targetFor = async (directory) => {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  return {
    manifest,
    target: join(
      store,
      `${manifest.name.replaceAll("/", "+")}@${manifest.version}-${createHash("sha256").update(directory).digest("hex").slice(0, 10)}`,
    ),
  };
};
const link = async (path, target) => {
  await mkdir(dirname(path), { recursive: true });
  await rm(path, { recursive: true, force: true });
  await symlink(relative(dirname(path), target), path, "dir");
};
const pending = [...external.keys()];
const rootPackages = new Map();
for (const [directory, name] of external) {
  const { manifest, target } = await targetFor(directory);
  const existing = rootPackages.get(name);
  if (existing && existing.version !== manifest.version)
    throw new Error(`Conflicting root runtime package ${name}.`);
  rootPackages.set(name, { version: manifest.version, target });
}
for (const [name, { target }] of rootPackages)
  await link(join(output, "node_modules", name), target);
while (pending.length) {
  const directory = pending.shift();
  if (copied.has(directory)) continue;
  const { manifest, target } = await targetFor(directory);
  copied.set(directory, target);
  let complete = false;
  try {
    complete =
      (await readFile(join(target, ".voidmix-copy-complete"), "utf8")) === manifest.version;
  } catch {}
  if (!complete) {
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(directory, target, {
      recursive: true,
      dereference: true,
      filter: (source) => basename(source) !== "node_modules",
    });
    await writeFile(join(target, ".voidmix-copy-complete"), manifest.version);
  }
  // Nested ESM package.json files can suppress Node's automatic self-reference.
  await link(join(target, "node_modules", manifest.name), target);
  for (const dependency of Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  })) {
    if (dependency.startsWith("@types/")) continue;
    try {
      const source = await locate(dependency, directory);
      const { target: child } = await targetFor(source);
      await link(join(target, "node_modules", dependency), child);
      pending.push(source);
    } catch (error) {
      if (manifest.dependencies?.[dependency] && !manifest.optionalDependencies?.[dependency])
        throw error;
    }
  }
}
const used = new Set([...copied.values()].map((path) => basename(path)));
for (const entry of await readdir(store))
  if (!used.has(entry)) await rm(join(store, entry), { recursive: true, force: true });
await writeFile(join(output, ".runtime-layout-v1"), "1\n");
await writeFile(
  join(output, "package.json"),
  JSON.stringify({ name: "@voidmix/worker-runtime", private: true, type: "module" }, null, 2) +
    "\n",
);
process.stdout.write(
  `Built Worker Node artifact with ${copied.size} runtime packages and their assets.\n`,
);
