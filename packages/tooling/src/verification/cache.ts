import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Compare artifact identities, not gigabytes of cache contents or volatile DB mtimes. */
export async function cacheSnapshot(root: string, mode: string) {
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*.tar.zst").scan({
    cwd: join(root, "node_modules/.vite/task-cache"),
    onlyFiles: true,
  }))
    files.push(file);
  files.sort();
  const directory = join(root, ".artifacts/ci");
  const snapshot = join(directory, "vp-cache-before.json");
  if (mode === "snapshot") {
    mkdirSync(directory, { recursive: true });
    writeFileSync(snapshot, JSON.stringify(files));
  } else if (mode === "changed") {
    const previous = new Set(JSON.parse(readFileSync(snapshot, "utf8")) as string[]);
    const changed = files.some((file) => !previous.has(file));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    console.log(`New successful VP cache artifacts: ${changed}`);
  } else throw new Error("Unknown cache snapshot operation");
}
