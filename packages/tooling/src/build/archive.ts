import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnProcess } from "@raypx/runtime-node/process";

/** Windows' native bsdtar handles ZIP and tarballs without MSYS runtime conflicts. */
export async function extractArchive(archive: string, directory: string, stripComponents = 0) {
  const windows = process.platform === "win32";
  const tar = windows
    ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    : "tar";
  // Windows tar's narrow arguments lose Unicode paths. Pass archive bytes over stdin
  // and select the destination through the process working directory instead.
  const child = spawnProcess(
    [
      tar,
      "-xf",
      windows ? "-" : resolve(archive),
      ...(stripComponents ? [`--strip-components=${stripComponents}`] : []),
    ],
    {
      cwd: directory,
      stdin: windows ? await readFile(archive) : "ignore",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await child.exited;
  if (code !== 0) throw new Error(`${tar} exited ${code}`);
}
