import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { run, spawnProcess } from "@raypx/runtime-node/process";

/** Use native Windows tools without MSYS or narrow-character archive paths. */
export async function extractArchive(archive: string, directory: string, stripComponents = 0) {
  const windows = process.platform === "win32";
  if (windows && extname(archive).toLowerCase() === ".zip") {
    if (stripComponents) throw new Error("ZIP component stripping is unsupported");
    await run(
      join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:RAYPX_ARCHIVE_SOURCE, $env:RAYPX_ARCHIVE_DESTINATION)",
      ],
      directory,
      {
        ...process.env,
        RAYPX_ARCHIVE_SOURCE: resolve(archive),
        RAYPX_ARCHIVE_DESTINATION: resolve(directory),
      },
    );
    return;
  }
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
