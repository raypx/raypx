import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

/** Never mark an existing production data directory as disposable smoke state. */
export async function prepareSmokeDirectory(directory: string) {
  if (!isAbsolute(directory)) throw new Error("Native smoke data directory must be absolute");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const state = await lstat(directory);
  if (!state.isDirectory() || state.isSymbolicLink())
    throw new Error("Unsafe native smoke data directory");
  const marker = join(directory, ".native-smoke-session-owner");
  const owned = await lstat(marker).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (owned) {
    if (
      !owned.isFile() ||
      owned.isSymbolicLink() ||
      owned.size > 64 ||
      (await readFile(marker, "utf8")) !== "raypx-native-smoke-v1\n"
    )
      throw new Error("Invalid native smoke data ownership marker");
    await rm(join(directory, ".native-smoke-sessions-cleaned"), { force: true });
    return;
  }
  if ((await readdir(directory)).length > 0)
    throw new Error("Use an empty isolated native smoke data directory");
  await writeFile(marker, "raypx-native-smoke-v1\n", { mode: 0o600, flag: "wx" });
  await rm(join(directory, ".native-smoke-sessions-cleaned"), { force: true });
}
