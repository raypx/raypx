import { execFile } from "node:child_process";
import { lstat, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const registry =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
type Run = (command: string, args: string[]) => Promise<string>;
const run: Run = async (command, args) => (await execute(command, args)).stdout;

/** Remove only verified test applications from the isolated smoke output directory. */
export async function cleanupSmokeBundles(
  project: string,
  options: { platform?: NodeJS.Platform; run?: Run } = {},
) {
  if ((options.platform ?? process.platform) !== "darwin") return;
  const command = options.run ?? run;
  const root = resolve(project, "../../target/native-smoke/release/bundle/macos");
  const state = await lstat(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (!state) return;
  if (!state.isDirectory() || state.isSymbolicLink())
    throw new Error("Unsafe smoke output directory");
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !entry.name.endsWith(".app")) continue;
    const app = join(root, entry.name);
    const identifier = (
      await command("/usr/bin/plutil", [
        "-extract",
        "CFBundleIdentifier",
        "raw",
        "-o",
        "-",
        join(app, "Contents/Info.plist"),
      ])
    ).trim();
    if (identifier !== "com.raypx.desktop.native-smoke") continue;
    await command(registry, ["-u", app]);
    await rm(app, { recursive: true });
  }
}
