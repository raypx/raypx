import { createHash } from "node:crypto";
import { copyFile, lstat, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

class ReleaseCheckError extends Error {}

const smokeMarker = Buffer.from("RAYPX_NATIVE_SMOKE_SOCKET");
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Authenticode changes the checksum, certificate directory and appended certificate. */
function peCode(bytes: Buffer): Buffer {
  if (bytes.length < 64 || bytes.toString("ascii", 0, 2) !== "MZ") return bytes;
  const pe = bytes.readUInt32LE(60);
  if (pe + 24 > bytes.length || bytes.toString("ascii", pe, pe + 4) !== "PE\0\0")
    throw new ReleaseCheckError("Invalid release PE header");
  const optional = pe + 24;
  const optionalSize = bytes.readUInt16LE(pe + 20);
  const magic = bytes.readUInt16LE(optional);
  const directories = optional + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : 0);
  const certificate = directories + 4 * 8;
  if (
    directories === optional ||
    optional + optionalSize > bytes.length ||
    certificate + 8 > optional + optionalSize
  )
    throw new ReleaseCheckError("Invalid release PE optional header");
  const offset = bytes.readUInt32LE(certificate);
  const size = bytes.readUInt32LE(certificate + 4);
  const sections = bytes.readUInt16LE(pe + 6);
  let imageEnd = optional + optionalSize + sections * 40;
  if (imageEnd > bytes.length) throw new ReleaseCheckError("Invalid release PE section table");
  for (let index = 0; index < sections; index++) {
    const section = optional + optionalSize + index * 40;
    imageEnd = Math.max(
      imageEnd,
      bytes.readUInt32LE(section + 20) + bytes.readUInt32LE(section + 16),
    );
  }
  if (
    imageEnd > bytes.length ||
    (size && (offset < imageEnd || offset + size > bytes.length)) ||
    (!size && offset)
  )
    throw new ReleaseCheckError("Invalid release PE certificate range");
  const normalized = Buffer.from(bytes);
  normalized.fill(0, optional + 64, optional + 68);
  normalized.fill(0, certificate, certificate + 8);
  return size
    ? Buffer.concat([normalized.subarray(0, offset), normalized.subarray(offset + size)])
    : normalized;
}

async function codeIdentity(path: string, bytes: Buffer): Promise<string> {
  const magic = bytes.length >= 4 ? bytes.readUInt32BE(0) : 0;
  if (
    ![
      0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf,
      0xbfbafeca,
    ].includes(magic)
  )
    return sha256(peCode(bytes));
  // macOS signing can change load commands as well as append signature data.
  // Normalize only owned temporary copies; never alter the build or app bundle.
  const directory = await mkdtemp(join(tmpdir(), "raypx-release-signature-"));
  try {
    const temporary = join(directory, "executable");
    await copyFile(path, temporary);
    const command = Bun.spawn(["/usr/bin/codesign", "--remove-signature", temporary], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
    const deadline = setTimeout(() => command.kill(), 10000);
    try {
      const diagnostic = await new Response(command.stderr).text();
      if ((await command.exited) !== 0 && !diagnostic.includes("code object is not signed at all"))
        throw new ReleaseCheckError("Unable to normalize release executable signature");
    } finally {
      clearTimeout(deadline);
    }
    return sha256(await readFile(temporary));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function executable(path: string) {
  if (!(await lstat(path)).isFile())
    throw new ReleaseCheckError("Release executable must be a regular file");
  const bytes = await readFile(path);
  return { bytes, identity: await codeIdentity(path, bytes) };
}

function assertNoSmoke(bytes: Buffer) {
  if (
    bytes.includes(smokeMarker) ||
    bytes.includes(Buffer.from("RAYPX_NATIVE_SMOKE_SOCKET", "utf16le"))
  )
    throw new ReleaseCheckError("Release executable contains the native-smoke socket marker");
}

export async function checkRelease(options: {
  releaseDirectory: string;
  platform: "darwin" | "win32";
}) {
  const directory = await realpath(options.releaseDirectory);
  if (basename(directory) !== "release" || directory.split(/[\\/]/).includes("native-smoke"))
    throw new ReleaseCheckError(
      "Release gate requires the production release directory, outside native-smoke",
    );
  const extension = options.platform === "win32" ? ".exe" : "";
  const binary = join(directory, `raypx-desktop${extension}`);
  const target = await executable(binary);
  assertNoSmoke(target.bytes);
  const fingerprintDirectory = join(directory, ".fingerprint");
  const fingerprints: string[] = [];
  const matches: string[] = [];
  for (const entry of await readdir(fingerprintDirectory, { withFileTypes: true })) {
    const id = /^raypx-desktop-([a-f0-9]{16})$/.exec(entry.name)?.[1];
    if (!entry.isDirectory() || !id) continue;
    const fingerprint = join(fingerprintDirectory, entry.name, "bin-raypx-desktop.json");
    // Library, test and build-script records cannot establish a production bin build.
    if (!(await lstat(fingerprint).catch(() => undefined))?.isFile()) continue;
    fingerprints.push(fingerprint);
    const artifact = join(directory, "deps", `raypx_desktop-${id}${extension}`);
    if (!(await lstat(artifact).catch(() => undefined))?.isFile()) continue;
    if ((await executable(artifact)).identity === target.identity) matches.push(fingerprint);
  }
  // Cargo 1.97.1 omits extra-filename/pkg-dir metadata for local MSVC executables
  // to keep hashes out of embedded PDB paths. Its deps binary uses crate_name;
  // the fingerprint uses the package short hash instead of an artifact suffix.
  // https://github.com/rust-lang/cargo/blob/c980f4866141969fab6254a680546a277789d6f0/src/cargo/core/compiler/build_runner/compilation_files.rs#L922
  // https://github.com/rust-lang/cargo/blob/c980f4866141969fab6254a680546a277789d6f0/src/cargo/core/compiler/build_context/target_info.rs#L108
  let unhashed = "absent";
  if (options.platform === "win32") {
    const artifact = join(directory, "deps/raypx_desktop.exe");
    if ((await lstat(artifact).catch(() => undefined))?.isFile()) {
      unhashed =
        (await executable(artifact)).identity === target.identity ? "matches" : "different";
      if (unhashed === "matches" && fingerprints.length === 1) matches.push(fingerprints[0]!);
    }
  }
  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length !== 1 || (unhashed === "matches" && fingerprints.length !== 1))
    throw new ReleaseCheckError(
      "Expected one Cargo fingerprint matching the release binary; missing or ambiguous build evidence: " +
        JSON.stringify({
          binFingerprints: fingerprints.map((path) => basename(dirname(path))),
          matches: uniqueMatches.map((path) => basename(dirname(path))),
          unhashed,
          artifacts: (await readdir(join(directory, "deps"))).filter((name) =>
            name.startsWith("raypx_desktop"),
          ),
        }),
    );
  const fingerprint = uniqueMatches[0]!;
  const info = await lstat(fingerprint);
  if (!info.isFile() || info.size > 65536)
    throw new ReleaseCheckError("Invalid release Cargo fingerprint");
  const record = JSON.parse(await readFile(fingerprint, "utf8")) as { features?: unknown };
  const features: unknown =
    typeof record.features === "string" ? JSON.parse(record.features) : undefined;
  if (!Array.isArray(features) || features.some((feature) => typeof feature !== "string"))
    throw new ReleaseCheckError("Unsupported Cargo fingerprint features record");
  if (features.includes("native-smoke"))
    throw new ReleaseCheckError("Release binary was compiled with native-smoke");
  if (options.platform === "darwin") {
    const packaged = await executable(
      join(directory, "bundle/macos/Raypx.app/Contents/MacOS/raypx-desktop"),
    );
    assertNoSmoke(packaged.bytes);
    if (packaged.identity !== target.identity)
      throw new ReleaseCheckError(
        "Packaged Desktop executable does not match the checked Cargo release binary",
      );
  }
  return {
    features: features as string[],
    fingerprint: basename(dirname(fingerprint)),
    sha256: sha256(target.bytes),
    checked:
      options.platform === "darwin"
        ? "release binary and macOS app bundle"
        : "Windows packaging input executable",
  };
}

if (import.meta.main) {
  try {
    if (process.platform !== "darwin" && process.platform !== "win32")
      throw new ReleaseCheckError("Desktop release gate is configured for macOS and Windows");
    if (process.argv.length > 3)
      throw new ReleaseCheckError("Usage: check-release.ts [release-directory]");
    const root = resolve(import.meta.dirname, "../../../..");
    const target = process.env.CARGO_TARGET_DIR
      ? resolve(root, process.env.CARGO_TARGET_DIR)
      : join(root, "target");
    const result = await checkRelease({
      releaseDirectory: resolve(process.argv[2] ?? join(target, "release")),
      platform: process.platform,
    });
    console.log(
      `Production Desktop has no native-smoke feature or socket marker: ${JSON.stringify(result)}`,
    );
  } catch (error) {
    console.error(
      error instanceof ReleaseCheckError
        ? error.message
        : "Production Desktop release check failed: missing or invalid build evidence.",
    );
    process.exitCode = 1;
  }
}
