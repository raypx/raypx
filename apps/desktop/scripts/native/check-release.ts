import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** Inspect compiler metadata and the shipped bytes, including embedded renderer assets. */
export function assertProduction(bytes: Uint8Array, buildInfo: string) {
  const binary = Buffer.from(bytes);
  if (!/\bgithub\.com\/egoist\/mygo\s+v0\.7\.3\b/.test(buildInfo))
    throw new Error("Release is missing the pinned MyGo dependency");
  if (
    /(?:^|[\s,=])native_smoke(?:[\s,]|$)/m.test(buildInfo) ||
    ["RAYPX_NATIVE_SMOKE_SOCKET", "raypx-smoke-local-event"].some((marker) =>
      binary.includes(Buffer.from(marker)),
    )
  )
    throw new Error("Production Desktop includes smoke controls");
  if (!/mygo_noinspector/.test(buildInfo))
    throw new Error("Production Desktop must exclude the MyGo inspector");
}

export async function checkRelease(binary: string) {
  const command = Bun.spawn(["go", "version", "-m", binary], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const metadata = await new Response(command.stdout).text();
  if (await command.exited) throw new Error("Unable to inspect the Go release executable");
  assertProduction(await readFile(binary), metadata);
  const resources =
    process.platform === "darwin" ? resolve(dirname(binary), "../Resources") : dirname(binary);
  const herdr = join(resources, "bin/herdr");
  const manifest = await Bun.file(join(herdr, "runtime.json")).json();
  const cli = await Bun.file(resolve(import.meta.dirname, "../../../cli/package.json")).json();
  const executable = process.platform === "win32" ? "herdr.exe" : "herdr";
  if (manifest.version !== cli.herdr.version || !manifest.files?.[executable])
    throw new Error("Release Herdr manifest is missing or stale");
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!name.split("/").every((part) => /^[\w. -]+$/.test(part) && part !== "." && part !== ".."))
      throw new Error("Invalid release Herdr resource path");
    const actual = createHash("sha256")
      .update(new Uint8Array(await Bun.file(join(herdr, name)).arrayBuffer()))
      .digest("hex");
    if (actual !== expected)
      throw new Error("Signed Herdr bytes differ from the packaged runtime manifest");
  }
  return { binary, framework: "mygo", smokeControls: false, herdrChecksumsVerified: true };
}

if (import.meta.main) {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  const directory = resolve(import.meta.dirname, "../../build", `${platform}-${arch}`);
  const binary =
    process.platform === "darwin"
      ? join(directory, "Raypx.app/Contents/MacOS/Raypx")
      : join(directory, process.platform === "win32" ? "Raypx.exe" : "raypx-desktop");
  console.log(JSON.stringify(await checkRelease(binary)));
}
