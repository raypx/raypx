import { dirname, join } from "node:path";
import { run } from "@raypx/runtime-node/process";

/** Windows' native bsdtar handles ZIP and tarballs without MSYS runtime conflicts. */
export async function extractArchive(archive: string, directory: string, stripComponents = 0) {
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  await run(
    tar,
    [
      "-xf",
      archive,
      "-C",
      directory,
      ...(stripComponents ? [`--strip-components=${stripComponents}`] : []),
    ],
    dirname(directory),
  );
}
