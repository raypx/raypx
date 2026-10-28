import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, win32 } from "node:path";
import { tauriSigningEnvironment } from "./tauri";

interface RegistryKeys {
  product: string;
  uninstall: string;
}
export interface SmokeRegistration {
  hive: "CurrentUser" | "LocalMachine";
  view: "Registry32" | "Registry64";
  product: boolean;
  uninstall: boolean;
  productLocation: string | null;
  installLocation: string | null;
}
export interface WindowsSmokeCommands {
  execute(file: string, rawArguments: string): Promise<void>;
  registrations(keys: RegistryKeys): Promise<SmokeRegistration[]>;
  clearProduct(keys: RegistryKeys, directory: string): Promise<void>;
}
export interface SmokeInstallation {
  binary: string;
  dispose(): Promise<void>;
}

// ProcessStartInfo preserves NSIS's unquoted /D= and _?= tail, even with spaces.
// Values travel through the environment, never through PowerShell source interpolation.
async function powershell(script: string, values: Record<string, string>) {
  const child = Bun.spawn(
    [
      join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference = 'Stop'; ${script}`,
    ],
    {
      env: { ...tauriSigningEnvironment(process.env, { smoke: true }), ...values },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Windows smoke installation command failed: ${error.trim()}`);
  return output.trim();
}

const registryPreamble = String.raw`
$keys = $env:RAYPX_SMOKE_REGISTRY | ConvertFrom-Json
`;
const commands: WindowsSmokeCommands = {
  async execute(file, rawArguments) {
    await powershell(
      String.raw`
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $env:RAYPX_SMOKE_EXECUTABLE
$start.Arguments = $env:RAYPX_SMOKE_ARGUMENTS
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$child = [System.Diagnostics.Process]::Start($start)
if (-not $child.WaitForExit(180000)) {
  & "$env:SystemRoot\System32\taskkill.exe" /PID $child.Id /T /F | Out-Null
  throw 'NSIS timed out'
}
if ($child.ExitCode -ne 0) { throw "NSIS exited with code $($child.ExitCode)" }
`,
      { RAYPX_SMOKE_EXECUTABLE: file, RAYPX_SMOKE_ARGUMENTS: rawArguments },
    );
  },
  async registrations(keys) {
    const output = await powershell(
      registryPreamble +
        String.raw`
$entries = @()
foreach ($hive in @('CurrentUser', 'LocalMachine')) {
  foreach ($view in @('Registry32', 'Registry64')) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]$hive, [Microsoft.Win32.RegistryView]$view)
    $product = $base.OpenSubKey($keys.product)
    $uninstall = $base.OpenSubKey($keys.uninstall)
    try {
      $entries += @{
        hive = $hive; view = $view
        product = ($null -ne $product); uninstall = ($null -ne $uninstall)
        productLocation = $(if ($product) { $product.GetValue('') } else { $null })
        installLocation = $(if ($uninstall) { $uninstall.GetValue('InstallLocation') } else { $null })
      }
    } finally {
      if ($product) { $product.Dispose() }
      if ($uninstall) { $uninstall.Dispose() }
      $base.Dispose()
    }
  }
}
ConvertTo-Json -Compress -InputObject @($entries)
`,
      { RAYPX_SMOKE_REGISTRY: JSON.stringify(keys) },
    );
    return JSON.parse(output) as SmokeRegistration[];
  },
  async clearProduct(keys, directory) {
    await powershell(
      registryPreamble +
        String.raw`
foreach ($view in @('Registry32', 'Registry64')) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]$view)
  $product = $base.OpenSubKey($keys.product)
  try {
    if ($product -and $product.GetValue('') -ne $env:RAYPX_SMOKE_INSTALL_DIRECTORY) {
      throw 'Smoke install registration changed ownership'
    }
    $present = $null -ne $product
  } finally { if ($product) { $product.Dispose() } }
  try { if ($present) { $base.DeleteSubKeyTree($keys.product) } }
  finally { $base.Dispose() }
}
`,
      {
        RAYPX_SMOKE_REGISTRY: JSON.stringify(keys),
        RAYPX_SMOKE_INSTALL_DIRECTORY: directory,
      },
    );
  },
};

async function regularFile(path: string) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe smoke executable: ${path}`);
  return stat;
}
async function digest(path: string) {
  const stat = await regularFile(path);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { path, size: stat.size, sha256: hash.digest("hex") };
}

async function nsisMainPayload(path: string) {
  await regularFile(path);
  const bytes = await readFile(path);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const token = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
  const offset = bytes.indexOf(token);
  if (offset < 0) throw new Error(`Missing Tauri bundle-type token in NSIS main source: ${path}`);
  // tauri-bundler 2.10.4 bundle.rs patches only the first token before NSIS File
  // captures the main binary, then restores the source after packaging. Reproduce
  // that exact equal-length patch in memory; all installed bytes still must match.
  Buffer.from("__TAURI_BUNDLE_TYPE_VAR_NSS").copy(bytes, offset);
  return {
    path,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sourceSha256,
    bundleTypeOffset: offset,
  };
}
const sameLocation = (left: string | null, right: string) =>
  left !== null &&
  win32.normalize(left.replace(/^"(.*)"$/, "$1")).toLowerCase() ===
    win32.normalize(right).toLowerCase();

/** Install the actual unsigned smoke NSIS package once; callers dispose after all phases. */
export async function installWindowsSmoke(
  target: string,
  cli: string,
  options: { arch?: string; commands?: WindowsSmokeCommands } = {},
): Promise<SmokeInstallation> {
  const arch = { x64: "x64", arm64: "arm64", ia32: "x86" }[options.arch ?? process.arch];
  if (!arch) throw new Error("Unsupported Windows smoke architecture");
  const script = await readFile(join(target, "release/nsis", arch, "installer.nsi"), "utf8");
  const define = (name: string) => {
    const matches = [...script.matchAll(new RegExp(`^!define ${name} "([^"\\r\\n]*)"`, "gm"))];
    if (matches.length !== 1) throw new Error(`Missing or ambiguous NSIS ${name}`);
    return matches[0]![1]!;
  };
  if (
    define("PRODUCTNAME") !== "Raypx Test" ||
    define("BUNDLEID") !== "com.raypx.desktop.native-smoke" ||
    define("INSTALLMODE") !== "currentUser" ||
    define("MAINBINARYNAME") !== "raypx-desktop" ||
    define("ARCH") !== arch
  )
    throw new Error("Refusing to install a package without the per-user native-smoke identity");
  const manufacturer = define("MANUFACTURER");
  const version = define("VERSION");
  if (!/^[\w .-]+$/.test(manufacturer) || !/^[\w.+-]+$/.test(version))
    throw new Error("Unsafe NSIS smoke package metadata");
  const output = join(target, "release/bundle/nsis");
  const installers = (await readdir(output)).filter((name) => name.endsWith(".exe"));
  const name = `Raypx Test_${version}_${arch}-setup.exe`;
  if (installers.length !== 1 || installers[0] !== name)
    throw new Error("Missing or ambiguous native-smoke NSIS installer");
  const installer = join(output, name);
  await regularFile(installer);
  const mainSource = define("MAINBINARYSRCPATH").replace(/\$\$/g, "$");
  if ((await realpath(mainSource)) !== (await realpath(join(target, "release/raypx-desktop.exe"))))
    throw new Error("NSIS main payload source does not match the smoke build");
  const sidecars = [...script.matchAll(/^\s*File \/a "\/oname=raypx\.exe" "([^"\r\n]+)"\s*$/gm)];
  if (sidecars.length !== 1) throw new Error("Missing or ambiguous NSIS CLI payload source");
  const cliSource = sidecars[0]![1]!;
  const cliArchitecture = { x64: "x86_64", arm64: "aarch64", x86: "i686" }[arch];
  if (
    (await realpath(dirname(cliSource))) !==
      (await realpath(resolve(dirname(cli), "../../desktop/src-tauri/binaries"))) ||
    !new RegExp(`^raypx-${cliArchitecture}-pc-windows-(msvc|gnu|gnullvm)\\.exe$`).test(
      basename(cliSource),
    )
  )
    throw new Error(`NSIS CLI payload source does not match the staged sidecar: ${cliSource}`);
  const [expectedMain, expectedCli, cliBuild] = await Promise.all([
    nsisMainPayload(mainSource),
    digest(cliSource),
    digest(cli),
  ]);
  if (expectedCli.sha256 !== cliBuild.sha256)
    throw new Error(
      `Staged NSIS CLI payload differs from the CLI build: ${JSON.stringify({ payload: expectedCli, build: cliBuild })}`,
    );
  const keys = {
    product: `Software\\${manufacturer}\\Raypx Test`,
    uninstall: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Raypx Test",
  };
  const run = options.commands ?? commands;
  const registered = () => run.registrations(keys);
  if ((await registered()).some((entry) => entry.product || entry.uninstall))
    throw new Error("Existing Raypx Test installation found; refusing to replace it");
  const root = await mkdtemp(join(tmpdir(), "raypx-nsis-smoke-"));
  const directory = join(root, "Raypx Test");
  if (/["\r\n]/.test(directory)) throw new Error("Unsafe smoke install directory");
  const binary = join(directory, "raypx-desktop.exe");
  const uninstaller = join(directory, "uninstall.exe");
  let disposed = false;
  async function dispose() {
    if (disposed) return;
    const registrations = (await registered()).filter((entry) => entry.product || entry.uninstall);
    if (
      registrations.some(
        (entry) =>
          entry.hive !== "CurrentUser" ||
          (entry.product && !sameLocation(entry.productLocation, directory)) ||
          (entry.uninstall && !sameLocation(entry.installLocation, directory)),
      )
    )
      throw new Error(`Smoke registration changed ownership; retained ${root}`);
    const present = await lstat(uninstaller).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (present) {
      await regularFile(uninstaller);
      // _?= must be the final, unquoted tail. It keeps uninstall in place so we can wait.
      await run.execute(uninstaller, `/S _?=${directory}`);
    }
    const remaining = (await registered()).filter((entry) => entry.product || entry.uninstall);
    if (
      remaining.some(
        (entry) =>
          entry.uninstall ||
          entry.hive !== "CurrentUser" ||
          !sameLocation(entry.productLocation, directory),
      )
    )
      throw new Error(`Smoke uninstall incomplete; retained ${root}`);
    // Tauri deliberately retains its install-location key on a silent uninstall.
    // Remove only our matching product key, never its shared manufacturer parent.
    await run.clearProduct(keys, directory);
    if ((await registered()).some((entry) => entry.product || entry.uninstall))
      throw new Error(`Smoke installation registration remained; retained ${root}`);
    await rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
    disposed = true;
  }
  try {
    // /NS avoids shortcuts. Omitting /R prevents Tauri's silent-installer auto launch.
    // /D= must be the final, unquoted tail, including any spaces in the owned path.
    await run.execute(installer, `/S /NS /D=${directory}`);
    const entries = (await registered()).filter((entry) => entry.product || entry.uninstall);
    if (
      !entries.some(
        (entry) =>
          entry.view === (arch === "x86" ? "Registry32" : "Registry64") &&
          entry.product &&
          entry.uninstall &&
          sameLocation(entry.installLocation, directory) &&
          sameLocation(entry.productLocation, directory),
      ) ||
      // HKCU Software keys can be shared by the two registry views.
      entries.some(
        (entry) =>
          entry.hive !== "CurrentUser" ||
          (entry.uninstall && !sameLocation(entry.installLocation, directory)) ||
          (entry.product && !sameLocation(entry.productLocation, directory)),
      )
    )
      throw new Error("NSIS did not register the owned per-user smoke installation");
    const [installedMain, installedCli] = await Promise.all([
      digest(binary),
      digest(join(directory, "raypx.exe")),
    ]);
    const payloads = {
      main: { expected: expectedMain, installed: installedMain },
      cli: { expected: expectedCli, installed: installedCli },
    };
    const differences: string[] = [];
    if (installedMain.sha256 !== expectedMain.sha256) differences.push("main executable");
    if (installedCli.sha256 !== expectedCli.sha256) differences.push("CLI");
    if (differences.length)
      throw new Error(
        `Installed smoke ${differences.join(" and ")} differs from the packaged build: ${JSON.stringify(payloads)}`,
      );
    await regularFile(uninstaller);
    console.info(`Native smoke NSIS payload hashes verified: ${JSON.stringify(payloads)}`);
    console.info(`Native smoke installed actual NSIS package in ${directory}`);
    return { binary, dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      const reason = error instanceof Error ? error.message : "unknown install failure";
      throw new Error(`Smoke installation failed; retained ${root}: ${reason}`, {
        cause: cleanupError,
      });
    }
    throw error;
  }
}
