import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const [supplied, result] = Bun.argv.slice(2);
if (process.platform !== "darwin" || !supplied)
  throw new Error("Usage on macOS: bun mygo-package.ts <Raypx.app> [result.json]");
const app = resolve(supplied);
if (!app.endsWith(".app") || !(await lstat(app)).isDirectory())
  throw new Error("Select an existing MyGo app bundle");

async function command(args: string[], env = process.env, cwd = root) {
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code) throw new Error(`Packaged artifact command failed: ${args[0]}`);
  return { stdout, stderr };
}
async function macho(path: string) {
  const bytes = await Bun.file(path).slice(0, 32).arrayBuffer();
  const header = new DataView(bytes);
  if (bytes.byteLength !== 32 || header.getUint32(0, true) !== 0xfeedfacf)
    throw new Error("Artifact check requires a thin 64-bit Mach-O executable");
  const architecture = new Map([
    [0x0100000c, "arm64"],
    [0x01000007, "x64"],
  ]).get(header.getUint32(4, true));
  if (!architecture) throw new Error("Unsupported executable architecture");
  const length = header.getUint32(20, true);
  if (length > 1024 * 1024) throw new Error("Mach-O load commands exceed limit");
  const commands = new Uint8Array(
    await Bun.file(path)
      .slice(32, 32 + length)
      .arrayBuffer(),
  );
  const view = new DataView(commands.buffer);
  const segments = [];
  let offset = 0;
  for (let index = 0; index < header.getUint32(16, true); index++) {
    if (offset + 8 > commands.length) throw new Error("Invalid Mach-O command");
    const kind = view.getUint32(offset, true);
    const commandSize = view.getUint32(offset + 4, true);
    if (commandSize < 8 || offset + commandSize > commands.length)
      throw new Error("Invalid Mach-O command size");
    if (kind === 0x19 && commandSize >= 72)
      segments.push(
        new TextDecoder().decode(commands.slice(offset + 8, offset + 24)).replaceAll("\0", ""),
      );
    offset += commandSize;
  }
  return { architecture, segments };
}
async function size(path: string): Promise<number> {
  const info = await lstat(path);
  if (!info.isDirectory()) return info.size;
  const children = await Promise.all((await readdir(path)).map((entry) => size(join(path, entry))));
  return children.reduce((sum, bytes) => sum + bytes, 0);
}
async function sha256(path: string) {
  return createHash("sha256")
    .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
    .digest("hex");
}

const metadata: unknown = JSON.parse(
  (
    await command([
      "/usr/bin/plutil",
      "-convert",
      "json",
      "-o",
      "-",
      join(app, "Contents/Info.plist"),
    ])
  ).stdout,
);
if (
  !metadata ||
  typeof metadata !== "object" ||
  !("CFBundleExecutable" in metadata) ||
  typeof metadata.CFBundleExecutable !== "string" ||
  metadata.CFBundleExecutable.includes("/")
)
  throw new Error("Invalid bundle executable metadata");
const binary = join(app, "Contents/MacOS", metadata.CFBundleExecutable);
const cli = join(app, "Contents/Resources/bin/raypx");
const [native, standalone] = await Promise.all([macho(binary), macho(cli)]);
if (native.architecture !== standalone.architecture || native.architecture !== process.arch)
  throw new Error("Desktop and standalone CLI architectures must match this host");
if (!standalone.segments.includes("__BUN"))
  throw new Error("CLI does not contain the expected embedded Bun payload");
await command(["/usr/bin/codesign", "--verify", "--deep", "--strict", app]);
const signature = (await command(["/usr/bin/codesign", "-dv", app])).stderr;
const temporary = await mkdtemp(join(tmpdir(), "raypx-mygo-package-"));
let check: Record<string, unknown>;
try {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: "",
    RAYPX_HOME: temporary,
    RAYPX_DESKTOP_DATA_DIR: temporary,
  };
  delete env.BUN_BE_BUN;
  delete env.BUN_OPTIONS;
  check = JSON.parse(
    (await command([binary, "--self-check", "--cli", cli], env, temporary)).stdout,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const manifest = await Bun.file(join(root, "apps/desktop/package.json")).json();
const renderer = join(root, "apps/desktop/dist/client/index.html");
if (
  check.framework !== "mygo" ||
  check.version !== manifest.version ||
  check.cliVersion !== manifest.version ||
  check.indexSha256 !== (await sha256(renderer))
)
  throw new Error("Packaged app, CLI and renderer identity differ");
const herdrRoot = join(app, "Contents/Resources/bin/herdr");
const herdr = await Bun.file(join(herdrRoot, "runtime.json")).json();
const cliManifest = await Bun.file(join(root, "apps/cli/package.json")).json();
if (herdr.version !== cliManifest.herdr.version || !herdr.files?.herdr)
  throw new Error("Packaged Herdr runtime version is missing or stale");
for (const [name, expected] of Object.entries(herdr.files)) {
  if (
    !name.split("/").every((part) => /^[\w. -]+$/.test(part) && part !== "." && part !== "..") ||
    (await sha256(join(herdrRoot, name))) !== expected
  )
    throw new Error("Packaged Herdr runtime checksum differs");
}
const report = {
  measuredAt: new Date().toISOString(),
  app,
  platform: `darwin/${native.architecture}`,
  version: manifest.version,
  check,
  native,
  standalone,
  herdr: { version: herdr.version, files: Object.keys(herdr.files), checksumsVerified: true },
  bytes: { app: await size(app), executable: await size(binary), cli: await size(cli) },
  sha256: { executable: await sha256(binary), cli: await sha256(cli) },
  integritySignatureVerified: true,
  signature: signature.includes("Signature=adhoc")
    ? "ad-hoc"
    : "signed; distribution identity not accepted by this check",
  externalJavaScriptRuntimeRequired: false,
  limitations: [
    "No native GUI event loop started",
    "No user profile or credentials accessed",
    "No Developer ID/notarization/update-install acceptance",
    "Windows and Linux bundles not checked",
  ],
};
if (result) {
  const output = resolve(result);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
