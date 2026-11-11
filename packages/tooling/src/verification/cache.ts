import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskCacheSnapshot } from "@raypx-kit/devkit/tasks";

interface CacheSnapshot {
  artifacts: string[];
  databases: Record<string, string>;
}

async function snapshot(cache: string): Promise<CacheSnapshot> {
  const { artifacts } = taskCacheSnapshot(cache);
  const databases: Record<string, string> = {};
  if (existsSync(cache)) {
    for (const file of new Bun.Glob("**/cache.db{,-wal}").scanSync({
      cwd: cache,
      onlyFiles: true,
    })) {
      const digest = new Bun.CryptoHasher("sha256");
      for await (const chunk of Bun.file(join(cache, file)).stream()) digest.update(chunk);
      databases[file.replaceAll("\\", "/")] = digest.digest("hex");
    }
  }
  return { artifacts, databases };
}

/** Output archives have stable identities. Log-only results live in the cache database. */
export async function cacheSnapshot(root: string, mode: string) {
  const cache = join(root, "node_modules/.vite/task-cache");
  const directory = join(root, ".artifacts/ci");
  const file = join(directory, "vp-cache-before.json");
  if (mode === "snapshot") {
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, JSON.stringify(await snapshot(cache)));
  } else if (mode === "changed") {
    const before = JSON.parse(readFileSync(file, "utf8")) as CacheSnapshot;
    const after = await snapshot(cache);
    const archives = new Set(before.artifacts);
    const changed =
      after.artifacts.some((artifact) => !archives.has(artifact)) ||
      Object.entries(after.databases).some(([path, digest]) => before.databases[path] !== digest);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    console.log(`New VP cache contents: ${changed}`);
  } else throw new Error("Unknown cache snapshot operation");
}
