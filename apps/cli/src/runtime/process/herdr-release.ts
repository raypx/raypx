import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import manifest from "../../../package.json";
import { LocalError } from "../errors";

export const herdrVersion = manifest.herdr.version;
export function bundledHerdrDirectory() {
  return [
    join(dirname(process.execPath), "herdr"),
    join(dirname(process.execPath), "../Resources/herdr"),
  ].find((path) => existsSync(join(path, "runtime.json")));
}
const executable = process.platform === "win32" ? "herdr.exe" : "herdr";
export async function digestHerdr(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function stamp(root: string) {
  const files: Record<string, string> = {};
  for (const name of await readdir(root, { recursive: true })) {
    if (name === "runtime.json") continue;
    const info = await stat(join(root, name));
    if (info.isFile()) files[name.replaceAll("\\", "/")] = await digestHerdr(join(root, name));
  }
  await writeFile(join(root, "runtime.json"), JSON.stringify({ version: herdrVersion, files }));
}
export async function verifyHerdrDirectory(root: string) {
  try {
    const value = JSON.parse(await readFile(join(root, "runtime.json"), "utf8")) as {
      version: string;
      files: Record<string, string>;
    };
    if (value.version !== herdrVersion || !value.files[executable]) return false;
    for (const [name, digest] of Object.entries(value.files)) {
      if (
        !name
          .split("/")
          .every((part) => /^[\w. -]+$/.test(part) && part !== "." && part !== "..") ||
        (await digestHerdr(join(root, name))) !== digest
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
/** Build-time download only. Runtime terminal.open never downloads executables. */
export async function prepareHerdr(output: string) {
  if (await verifyHerdrDirectory(output)) return join(output, executable);
  const key = `${process.platform}-${process.arch}` as keyof typeof manifest.herdr.assets;
  const asset = manifest.herdr.assets[key];
  if (!asset) throw new Error("Herdr runtime is unavailable for this platform");
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(join(dirname(output), ".herdr-"));
  try {
    const local = process.platform !== "win32" ? Bun.which("herdr") : undefined;
    if (local && (await digestHerdr(local)) === asset.sha256) {
      await copyFile(local, join(staging, executable));
    } else {
      const response = await fetch(
        `https://github.com/herdrdev/herdr/releases/download/v${herdrVersion}/${asset.name}`,
      );
      if (!response.ok) throw new Error("Herdr runtime download failed");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
        throw new Error("Herdr runtime checksum differs");
      if (process.platform === "win32") {
        const archive = join(staging, "runtime.zip");
        await Bun.write(archive, bytes);
        const unpack = Bun.spawn(
          [
            join(process.env.SystemRoot ?? "C:\\Windows", "System32/tar.exe"),
            "-xf",
            archive,
            "-C",
            staging,
          ],
          { stdout: "ignore", stderr: "ignore" },
        );
        if ((await unpack.exited) !== 0) throw new Error("Herdr runtime extraction failed");
        await rm(archive);
        if (!(await stat(join(staging, executable)).catch(() => undefined))?.isFile()) {
          const directories = (await readdir(staging, { withFileTypes: true })).filter((entry) =>
            entry.isDirectory(),
          );
          if (directories.length !== 1) throw new Error("Invalid Herdr distribution layout");
          const nested = join(staging, directories[0]!.name);
          await cp(nested, staging, { recursive: true });
          await rm(nested, { recursive: true });
        }
      } else await Bun.write(join(staging, executable), bytes);
    }
    if (process.platform !== "win32") await chmod(join(staging, executable), 0o755);
    // Release licenses remain beside the runtime, including Windows ConPTY notices.
    const license = await fetch(
      `https://raw.githubusercontent.com/herdrdev/herdr/v${herdrVersion}/LICENSE`,
    );
    if (!license.ok) throw new Error("Herdr license download failed");
    await Bun.write(join(staging, "HERDR-LICENSE"), await license.text());
    await stamp(staging);
    await rm(output, { recursive: true, force: true });
    await rename(staging, output);
    return join(output, executable);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function resolveHerdrBinary(directory: string, selected?: string) {
  if (selected) {
    if (!isAbsolute(selected))
      throw new LocalError("TERMINAL_HOST_UNAVAILABLE", "Select an absolute Herdr executable");
    return selected;
  }
  const source = process.env.RAYPX_HERDR_SOURCE ?? bundledHerdrDirectory();
  const cached = join(
    directory,
    "bin",
    `herdr-${herdrVersion}-${process.platform}-${process.arch}`,
  );
  if (await verifyHerdrDirectory(cached)) return join(cached, executable);
  if (source && (await verifyHerdrDirectory(source))) {
    // Windows updaters can replace the bundle while the daemon uses this copy.
    await mkdir(dirname(cached), { recursive: true });
    await cp(source, cached, { recursive: true });
    if (await verifyHerdrDirectory(cached)) return join(cached, executable);
  }
  const installed = Bun.which("herdr");
  if (installed) return installed;
  throw new LocalError(
    "TERMINAL_HOST_UNAVAILABLE",
    "Prepare the Herdr runtime before opening terminals",
  );
}
