import { fileURLToPath as entryFile } from "node:url";
import { spawnProcess } from "@raypx/runtime-node/process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { signingEnvironment } from "./signing.ts";
import { stageRuntime } from "./prepare-cli.ts";
import { generateNativeContracts } from "./generate.ts";

const desktop = resolve(import.meta.dirname, "../..");
const root = resolve(desktop, "../..");
const [action = "", ...args] = process.argv.slice(2);
const smoke = process.env.RAYPX_NATIVE_SMOKE_PACKAGE === "1";
const env: NodeJS.ProcessEnv = {
  ...signingEnvironment(process.env, { smoke }),
  ...(smoke ? { CARGO_TARGET_DIR: join(root, "target/native-smoke") } : {}),
};
export function assertNativeTarget(
  supplied: readonly string[],
  options: { platform?: NodeJS.Platform; arch?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const allowed: Record<string, string> = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "win32-x64": "x86_64-pc-windows-msvc",
    "win32-arm64": "aarch64-pc-windows-msvc",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
  };
  const target = allowed[`${options.platform ?? process.platform}-${options.arch ?? process.arch}`];
  if (!target) throw new Error("Unsupported native target");
  const inherited = options.env ?? process.env;
  if (inherited.CARGO_BUILD_TARGET && inherited.CARGO_BUILD_TARGET !== target)
    throw new Error("Cross compilation requires a matching complete CLI distribution");
  for (let i = 0; i < supplied.length; i++) {
    const value = supplied[i]!;
    if (
      (value === "--target" && supplied[++i] !== target) ||
      (value.startsWith("--target=") && value.slice(9) !== target)
    )
      throw new Error("Cross compilation requires a matching complete CLI distribution");
  }
  return target;
}
async function run(command: string[], cwd = desktop) {
  const child = spawnProcess(command, {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (await child.exited) throw new Error(`Native ${action} failed`);
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
async function prepareCli() {
  const source = resolve(env.RAYPX_CLI_PAYLOAD ?? join(root, "apps/cli/dist"));
  const manifest = JSON.parse(await readFile(join(source, "runtime.json"), "utf8"));
  const { version } = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
  if (
    manifest.version !== version ||
    !manifest.files?.[process.platform === "win32" ? "raypx.exe" : "raypx"]
  )
    throw new Error("Build the matching complete CLI distribution first");
  const target = join(desktop, "resources/bin");
  await stageRuntime(source, target);
}
export async function prepare(rendererRequired = true) {
  await prepareCli();
  await generateNativeContracts(desktop);
  if (rendererRequired)
    await readFile(
      join(desktop, smoke ? "artifacts/native-smoke/client/index.html" : "dist/client/index.html"),
    );
}
export async function bundleConfig() {
  const pubkey = env.RAYPX_TAURI_UPDATER_PUBLIC_KEY,
    endpoint = env.RAYPX_TAURI_UPDATER_URL;
  if (Boolean(pubkey) !== Boolean(endpoint) || (endpoint && !endpoint.startsWith("https://")))
    throw new Error("Configure a new Tauri update key and HTTPS feed together");
  const config = {
    ...(smoke
      ? {
          productName: "Raypx Test",
          mainBinaryName: "raypx-desktop",
          identifier: "com.raypx.desktop.native-smoke",
          build: { frontendDist: "../artifacts/native-smoke/client" },
        }
      : {}),
    bundle: {
      targets: [process.platform === "darwin" ? "app" : "nsis"],
      createUpdaterArtifacts: !smoke && Boolean(pubkey),
      ...(process.platform === "darwin"
        ? {
            macOS: {
              minimumSystemVersion: "13.5",
              signingIdentity: smoke ? "-" : (env.APPLE_SIGNING_IDENTITY ?? null),
            },
          }
        : {}),
      ...(process.platform === "win32" && env.RAYPX_DESKTOP_SIGNING_THUMBPRINT
        ? {
            windows: {
              certificateThumbprint: env.RAYPX_DESKTOP_SIGNING_THUMBPRINT,
              timestampUrl: "http://timestamp.digicert.com",
              digestAlgorithm: "sha256",
            },
          }
        : {}),
    },
    plugins: !smoke && pubkey ? { updater: { pubkey, endpoints: [endpoint] } } : {},
  };
  if (!smoke && process.platform === "darwin") config.bundle.targets = ["app", "dmg"];
  const directory = join(desktop, "generated");
  await mkdir(directory, { recursive: true });
  const file = join(directory, smoke ? "tauri-smoke.json" : "tauri-bundle.json");
  await writeFile(file, JSON.stringify(config, null, 2));
  return file;
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === entryFile(import.meta.url)) {
  assertNativeTarget(args);
  const features = smoke ? ["--features", "native-smoke"] : [];
  switch (action) {
    case "prepare-cli":
      await prepareCli();
      break;
    case "prepare":
      await prepare();
      break;
    case "check":
      await generateNativeContracts(desktop);
      await run(["cargo", "fmt", "--all", "--check"], root);
      await run(
        [
          "cargo",
          "check",
          "--locked",
          "--workspace",
          "--all-targets",
          ...(process.platform === "linux" ? ["--no-default-features"] : []),
          "--features",
          "native-smoke",
        ],
        root,
      );
      await run(
        [
          "cargo",
          "clippy",
          "--locked",
          "--workspace",
          "--all-targets",
          ...(process.platform === "linux" ? ["--no-default-features"] : []),
          "--features",
          "native-smoke",
          "--",
          "-D",
          "warnings",
        ],
        root,
      );
      break;
    case "test":
      await generateNativeContracts(desktop);
      await run(
        [
          "cargo",
          "test",
          "--locked",
          "--workspace",
          ...(process.platform === "linux" ? ["--no-default-features"] : []),
          "--features",
          "native-smoke",
          ...args,
        ],
        root,
      );
      break;
    case "build":
      await prepare();
      await run([
        process.execPath,
        "--bun",
        "tauri",
        "build",
        "--config",
        await bundleConfig(),
        ...features,
        ...args,
      ]);
      break;
    case "dev":
      await prepare(false);
      await run([process.execPath, "--bun", "tauri", "dev", ...args]);
      break;
    case "smoke":
      await generateNativeContracts(desktop);
      await run(
        [
          "cargo",
          "test",
          "--locked",
          "-p",
          "raypx-desktop",
          "--no-default-features",
          "--features",
          "native-smoke",
        ],
        root,
      );
      break;
    default:
      throw new Error("Usage: tauri.ts prepare-cli|prepare|build|check|test|smoke|dev");
  }
}
