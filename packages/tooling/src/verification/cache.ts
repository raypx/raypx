import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskCacheSnapshot } from "@raypx-kit/devkit/tasks";

/** Compare artifact identities, not gigabytes of cache contents or volatile DB mtimes. */
export async function cacheSnapshot(root: string, mode: string) {
  const cache = join(root, "node_modules/.vite/task-cache");
  const files = taskCacheSnapshot(cache).artifacts;
  const directory = join(root, ".artifacts/ci");
  const snapshot = join(directory, "vp-cache-before.json");
  if (mode === "snapshot") {
    mkdirSync(directory, { recursive: true });
    writeFileSync(snapshot, JSON.stringify(files));
  } else if (mode === "changed") {
    const changed = taskCacheSnapshot(
      cache,
      JSON.parse(readFileSync(snapshot, "utf8")) as string[],
    ).changed;
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    console.log(`New successful VP cache artifacts: ${changed}`);
  } else throw new Error("Unknown cache snapshot operation");
}
