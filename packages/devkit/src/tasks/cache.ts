import { existsSync, globSync } from "node:fs";
export function taskCacheSnapshot(directory: string, previous: readonly string[] = []) {
  const artifacts = existsSync(directory)
    ? globSync("**/*.tar.zst", { cwd: directory })
        .map((file) => file.replaceAll("\\", "/"))
        .sort()
    : [];
  const before = new Set(previous);
  return { artifacts, changed: artifacts.some((file) => !before.has(file)) };
}
