import { chmod, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
const source = resolve(import.meta.dirname, "../../cli/dist", executable);
const target = resolve(import.meta.dirname, "../.hutch/bin", executable);
const cliVersion = (await Bun.file(resolve(import.meta.dirname, "../../cli/package.json")).json())
  .version;
const desktopVersion = (await Bun.file(resolve(import.meta.dirname, "../package.json")).json())
  .version;
if (cliVersion !== desktopVersion) throw new Error("Desktop and bundled CLI versions must match");
const probe = Bun.spawn([source, "--version"], { stdout: "pipe", stderr: "pipe" });
if (
  (await new Response(probe.stdout).text()).trim() !== desktopVersion ||
  (await probe.exited) !== 0
)
  throw new Error("Built CLI artifact version does not match Desktop");
if (
  process.argv.includes("--release") &&
  !(await Bun.file(resolve(import.meta.dirname, "../dist/index.html")).exists())
)
  throw new Error("Build the Desktop renderer before native packaging");
await mkdir(resolve(import.meta.dirname, "../.hutch/bin"), { recursive: true });
await copyFile(source, target);
if (process.platform !== "win32") await chmod(target, 0o755);
