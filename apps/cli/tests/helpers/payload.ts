import { join } from "node:path";

/** Artifact tests bind network/process assertions to the executable that runs JavaScript. */
export function payloadRuntime(directory: string, files: Record<string, string>) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return join(
    directory,
    files["bun" + suffix] && files["cli.js"] ? "bun" + suffix : "raypx" + suffix,
  );
}
