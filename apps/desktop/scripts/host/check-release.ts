import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { MYGO_VERSION } from "./packager.js";

/** Inspect compiler metadata and the shipped bytes, including embedded renderer assets. */
export function assertProduction(bytes: Uint8Array, buildInfo: string) {
  const binary = Buffer.from(bytes);
  const version = /^\tdep\tgithub\.com\/egoist\/mygo\t([^\t\r\n]+)/m.exec(buildInfo)?.[1];
  if (version !== MYGO_VERSION) throw new Error("Release is missing the pinned MyGo dependency");
  if (
    /(?:^|[\s,=])native_smoke(?:[\s,]|$)/m.test(buildInfo) ||
    ["RAYPX_NATIVE_SMOKE_SOCKET", "raypx-smoke-local-event", "__raypxSmokeRequest"].some((marker) =>
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
  const packaged = await verifyCliPayload(join(resources, "bin"));
  if (process.env.RAYPX_CLI_PAYLOAD) {
    const prepared = await verifyCliPayload(resolve(process.env.RAYPX_CLI_PAYLOAD));
    if (JSON.stringify(prepared) !== JSON.stringify(packaged))
      throw new Error("Desktop modified the shared signed CLI payload");
  }
  return { binary, framework: "mygo", smokeControls: false, cliChecksumsVerified: true };
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
