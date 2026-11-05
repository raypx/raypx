import { spawnProcess } from "@raypx/runtime-node/process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

/** Sign executable resources before sealing their manifests and the outer application. */
export async function signRuntime(directory: string, env: NodeJS.ProcessEnv) {
  const executableFiles: string[] = [];
  async function walk(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Runtime resources cannot contain symlinks");
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const bytes = await readFile(file),
          magic = bytes.subarray(0, 4).toString("hex");
        if (
          (process.platform === "darwin" && ["cffaedfe", "cefaedfe", "cafebabe"].includes(magic)) ||
          (process.platform === "win32" && bytes[0] === 0x4d && bytes[1] === 0x5a)
        )
          executableFiles.push(file);
      }
    }
  }
  await walk(directory);
  for (const file of executableFiles) {
    const command =
      process.platform === "darwin"
        ? [
            "/usr/bin/codesign",
            "--force",
            "--options",
            "runtime",
            ...(env.APPLE_SIGNING_IDENTITY && env.APPLE_SIGNING_IDENTITY !== "-"
              ? ["--timestamp"]
              : []),
            "--sign",
            env.APPLE_SIGNING_IDENTITY ?? "-",
            "--entitlements",
            join(import.meta.dirname, "../../resources/Entitlements.plist"),
            file,
          ]
        : env.RAYPX_DESKTOP_SIGNING_THUMBPRINT
          ? [
              env.RAYPX_WINDOWS_SIGNTOOL ?? "signtool",
              "sign",
              "/fd",
              "sha256",
              "/tr",
              "http://timestamp.digicert.com",
              "/td",
              "sha256",
              "/sha1",
              env.RAYPX_DESKTOP_SIGNING_THUMBPRINT,
              file,
            ]
          : [];
    if (command.length) {
      const child = spawnProcess(command, { env, stdout: "inherit", stderr: "inherit" });
      if (await child.exited) throw new Error("Nested runtime signing failed");
    }
  }
  // Inner manifests first; the CLI manifest hashes the signed Herdr ledger too.
  for (const root of [join(directory, "herdr"), directory]) {
    const file = join(root, "runtime.json"),
      manifest = JSON.parse(await readFile(file, "utf8"));
    for (const name of Object.keys(manifest.files))
      manifest.files[name] = createHash("sha256")
        .update(await readFile(join(root, name)))
        .digest("hex");
    await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
  }
}
