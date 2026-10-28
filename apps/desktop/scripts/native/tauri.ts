import { resolve } from "node:path";

const apple = [
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_API_KEY",
  "APPLE_API_ISSUER",
  "APPLE_API_KEY_PATH",
] as const;
const windows = ["WINDOWS_CERTIFICATE", "WINDOWS_CERTIFICATE_PASSWORD"] as const;
const updater = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"] as const;

/** Tauri bundler 2.10.4 uses var_os: Some("") still enables certificate import. */
export function tauriSigningEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  options: { smoke?: boolean; platform?: string } = {},
): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const name of [...apple, ...windows, ...updater]) if (!env[name]) delete env[name];
  if (options.smoke) {
    // Test bundles never use distribution keys, notarization or signed updates.
    for (const name of [...apple, ...windows, ...updater]) delete env[name];
    return env;
  }
  const platform = options.platform ?? process.platform;
  if (platform === "darwin") {
    for (const names of [
      ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"],
      ["APPLE_API_KEY", "APPLE_API_ISSUER", "APPLE_API_KEY_PATH"],
    ])
      if (names.some((name) => env[name]) && !names.every((name) => env[name]))
        throw new Error(
          `Incomplete notarization credentials: configure ${names.join(", ")} together`,
        );
    const imported = Boolean(env.RAYPX_DESKTOP_SIGNING_KEYCHAIN);
    if ((env.APPLE_CERTIFICATE || imported) && !env.APPLE_SIGNING_IDENTITY)
      throw new Error("APPLE_SIGNING_IDENTITY is required for the configured signing certificate");
    if (env.APPLE_CERTIFICATE && source.APPLE_CERTIFICATE_PASSWORD === undefined)
      throw new Error(
        "Set APPLE_CERTIFICATE_PASSWORD explicitly, including an empty password if applicable",
      );
    if (env.APPLE_CERTIFICATE_PASSWORD && !env.APPLE_CERTIFICATE && !imported)
      throw new Error("APPLE_CERTIFICATE_PASSWORD requires a signing certificate");
    if (imported) {
      // CI already imported the certificate and configured the keychain search list.
      delete env.APPLE_CERTIFICATE;
      delete env.APPLE_CERTIFICATE_PASSWORD;
    } else if (env.APPLE_CERTIFICATE) {
      env.APPLE_CERTIFICATE_PASSWORD = source.APPLE_CERTIFICATE_PASSWORD;
    }
  } else {
    for (const name of apple) delete env[name];
  }
  if (platform === "win32") {
    if (env.WINDOWS_CERTIFICATE && !env.RAYPX_DESKTOP_SIGNING_THUMBPRINT)
      throw new Error("Import the Windows signing certificate before packaging");
    if (
      env.WINDOWS_CERTIFICATE_PASSWORD &&
      !env.WINDOWS_CERTIFICATE &&
      !env.RAYPX_DESKTOP_SIGNING_THUMBPRINT
    )
      throw new Error("WINDOWS_CERTIFICATE_PASSWORD requires a signing certificate");
  }
  // Tauri uses the imported Windows thumbprint from its config, not PFX contents.
  for (const name of windows) delete env[name];
  if (env.TAURI_SIGNING_PRIVATE_KEY) {
    if (!env.RAYPX_UPDATER_PUBLIC_KEY || !env.RAYPX_UPDATER_ENDPOINT?.startsWith("https://"))
      throw new Error("Updater signing requires a public key and HTTPS manifest endpoint");
    // Preserve an intentional empty key password so local builds cannot prompt.
    if (source.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === "")
      env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "";
  } else if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    throw new Error("TAURI_SIGNING_PRIVATE_KEY_PASSWORD requires an updater key");
  }
  return env;
}

export const bundleConfig = "src-tauri/tauri.bundle.conf.json";

/** Only packaging declares the CLI sidecar; Cargo dev builds never track its rebuilds. */
export function tauriArguments(args: readonly string[]): string[] {
  const [command, ...rest] = args;
  return command === "build" || command === "bundle"
    ? [command, "--config", bundleConfig, ...rest]
    : [...args];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (!args.length) throw new Error("Usage: tauri.ts <Tauri CLI command and arguments>");
  const child = Bun.spawn([process.execPath, "--bun", "tauri", ...tauriArguments(args)], {
    cwd: resolve(import.meta.dirname, "../.."),
    env: tauriSigningEnvironment(process.env),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const interrupt = () => child.kill("SIGINT"),
    terminate = () => child.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    process.exitCode = await child.exited;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
