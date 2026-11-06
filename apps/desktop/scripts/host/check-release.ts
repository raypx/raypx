import { fileURLToPath as entryFile } from "node:url";
import { readJsonFile, readBinaryFile } from "@raypx/runtime-node/files";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { satisfies } from "semver";
import { verifyRuntime } from "./prepare-cli.ts";

/** Inspect compiler metadata and the shipped bytes, including embedded renderer assets. */
export function assertProduction(bytes: Uint8Array) {
  const binary = Buffer.from(bytes);
  if (!binary.includes(Buffer.from("raypx-tauri/2.12.5")))
    throw new Error("Release is missing the pinned Tauri host marker");
  if (
    ["RAYPX_NATIVE_SMOKE_SOCKET", "raypx-smoke-local-event"].some((marker) =>
      binary.includes(Buffer.from(marker)),
    )
  )
    throw new Error("Production Desktop includes smoke controls");
}

export async function checkRelease(binary: string) {
  assertProduction(await readFile(binary));
  const resources =
    process.platform === "darwin" ? resolve(dirname(binary), "../Resources") : dirname(binary);
  const runtime = await verifyRuntime(join(resources, "bin"));
  const root = await readJsonFile(resolve(import.meta.dirname, "../../../../package.json"));
  const desktop = await readJsonFile(resolve(import.meta.dirname, "../../package.json"));
  const suffix = process.platform === "win32" ? ".exe" : "";
  if (
    runtime.version !== desktop.version ||
    !Number.isSafeInteger(runtime.builtAt) ||
    !satisfies(runtime.nodeVersion ?? "", root.engines.node) ||
    [
      "raypx" + suffix,
      "main.mjs",
      "runtime/node" + suffix,
      "runtime/NODE-LICENSE",
      "RAYPX-LICENSE",
      "herdr/runtime.json",
    ].some((name) => !runtime.files[name])
  )
    throw new Error("Release CLI runtime is incomplete or does not match the pinned build");
  const herdr = join(resources, "bin/herdr");
  const manifest = await readJsonFile(join(herdr, "runtime.json"));
  const cli = await readJsonFile(resolve(import.meta.dirname, "../../../cli/package.json"));
  const executable = process.platform === "win32" ? "herdr.exe" : "herdr";
  if (manifest.version !== cli.herdr.version || !manifest.files?.[executable])
    throw new Error("Release Herdr manifest is missing or stale");
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!name.split("/").every((part) => /^[\w. -]+$/.test(part) && part !== "." && part !== ".."))
      throw new Error("Invalid release Herdr resource path");
    const actual = createHash("sha256")
      .update(new Uint8Array(await readBinaryFile(join(herdr, name))))
      .digest("hex");
    if (actual !== expected)
      throw new Error("Signed Herdr bytes differ from the packaged runtime manifest");
  }
  return {
    binary,
    framework: "tauri",
    smokeControls: false,
    herdrChecksumsVerified: true,
    cliChecksumsVerified: true,
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === entryFile(import.meta.url)) {
  const directory = resolve(import.meta.dirname, "../../../../target/release");
  const binary =
    process.platform === "darwin"
      ? join(directory, "bundle/macos/Raypx.app/Contents/MacOS/raypx-desktop")
      : join(directory, process.platform === "win32" ? "raypx-desktop.exe" : "raypx-desktop");
  console.log(JSON.stringify(await checkRelease(binary)));
}
