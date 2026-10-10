import { object, strings, type JsonObject, type Manifest } from "./manifest.ts";

type LockRecord = [string, ...unknown[]];
export interface Lock {
  lockfileVersion: number;
  configVersion?: number;
  workspaces: JsonObject;
  packages: Record<string, LockRecord>;
  [key: string]: unknown;
}

export function registrySpec(name: string, lock: Lock): string {
  const record = lock.packages[name];
  if (!record || typeof record[0] !== "string" || record[0].includes("@workspace:"))
    throw new Error(`No locked registry dependency: ${name}`);
  const id = record[0];
  const delimiter = id.lastIndexOf("@");
  const actualName = id.slice(0, delimiter);
  const version = id.slice(delimiter + 1);
  if (!/^\d+\./.test(version)) throw new Error(`Not a registry version: ${id}`);
  return actualName === name ? version : `npm:${id}`;
}

/** Reject a new registry version, changed integrity, or changed transitive resolution. */
export function assertLockedGraph(expected: Lock, actual: Lock): void {
  const parent = (key: string) => {
    const parts = key.split("/");
    parts.pop();
    if (parts.at(-1)?.startsWith("@")) parts.pop();
    return parts.join("/");
  };
  const edges = (lock: Lock, key: string, value: unknown) =>
    Object.fromEntries(
      Object.keys(strings(value))
        .sort()
        .map((name) => {
          let owner = key;
          while (owner) {
            const nested = lock.packages[`${owner}/${name}`];
            if (nested) return [name, nested[0]];
            owner = parent(owner);
          }
          const record = lock.packages[name];
          if (!record) throw new Error(`Missing locked transitive dependency: ${key} -> ${name}`);
          return [name, record[0]];
        }),
    );
  const signature = (lock: Lock, key: string, entry: LockRecord) =>
    JSON.stringify([
      entry.at(-1),
      edges(lock, key, object(entry[2] ?? {}).dependencies),
      edges(lock, key, object(entry[2] ?? {}).optionalDependencies),
    ]);
  for (const [key, record] of Object.entries(actual.packages)) {
    if (record[0].includes("@file:") || record[0].includes("@workspace:")) continue;
    const candidates = Object.entries(expected.packages).filter(
      ([, candidate]) => candidate[0] === record[0],
    );
    if (
      !candidates.some(
        ([expectedKey, candidate]) =>
          signature(expected, expectedKey, candidate) === signature(actual, key, record),
      )
    )
      throw new Error(`Consumer registry graph drifted from bun.lock: ${key} (${record[0]})`);
  }
}

/** Project workspace records to the copied artifacts without re-resolving registry edges. */
export function projectLock(
  original: Lock,
  manifest: Pick<Manifest, "name" | "version"> & { dependencies: Record<string, string> },
  packages: ReadonlyMap<string, Manifest>,
): Lock {
  const dependencies = manifest.dependencies;
  const seed = structuredClone(original);
  seed.workspaces = { "": { name: manifest.name, version: manifest.version, dependencies } };
  for (const key of Object.keys(seed.packages))
    if (seed.packages[key]?.[0].includes("@workspace:")) delete seed.packages[key];
  for (const [name, packageManifest] of packages) {
    const metadata: JsonObject = { dependencies: packageManifest.dependencies };
    if (packageManifest.peerDependencies)
      metadata.peerDependencies = packageManifest.peerDependencies;
    const optionalPeers = Object.entries(object(packageManifest.peerDependenciesMeta ?? {}))
      .filter(([, value]) => object(value).optional === true)
      .map(([peer]) => peer);
    if (optionalPeers.length) metadata.optionalPeers = optionalPeers;
    const identity = `${name}@file:artifacts/${name.split("/")[1]}`;
    seed.packages[name] = [identity, metadata];
  }
  // Bun deduplicates file records by identity; every alias must retain metadata.
  for (const [name, packageManifest] of packages)
    for (const dependency of Object.keys(strings(packageManifest.dependencies)))
      if (packages.has(dependency))
        seed.packages[`${name}/${dependency}`] = seed.packages[dependency]!;
  return seed;
}
