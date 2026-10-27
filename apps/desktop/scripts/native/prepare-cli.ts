import { chmod, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
const source = resolve(import.meta.dirname, "../../../cli/dist", executable);
if (process.argv.slice(2).some((argument) => argument !== "--release"))
  throw new Error("Usage: prepare-cli.ts [--release]");
const compiler = Bun.spawn(["rustc", "-vV"], { stdout: "pipe", stderr: "ignore" });
const host = /^host: (.+)$/m.exec(await new Response(compiler.stdout).text())?.[1];
if ((await compiler.exited) !== 0 || !host) throw new Error("Rust toolchain target is unavailable");
if (process.env.TAURI_ENV_TARGET_TRIPLE && process.env.TAURI_ENV_TARGET_TRIPLE !== host)
  throw new Error("Build the CLI for the selected Tauri target before cross packaging");
const destination = resolve(import.meta.dirname, "../../src-tauri/binaries");
const targetName = `raypx-${host}${process.platform === "win32" ? ".exe" : ""}`;
const target = resolve(destination, targetName);
const cliVersion = (
  await Bun.file(resolve(import.meta.dirname, "../../../cli/package.json")).json()
).version;
const desktopVersion = (await Bun.file(resolve(import.meta.dirname, "../../package.json")).json())
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
  !(await Bun.file(resolve(import.meta.dirname, "../../dist/client/index.html")).exists())
)
  throw new Error("Build the selected Desktop renderer before native packaging");
await mkdir(destination, { recursive: true });
await copyFile(source, target);
if (process.platform !== "win32") await chmod(target, 0o755);
