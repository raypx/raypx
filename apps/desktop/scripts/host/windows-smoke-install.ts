import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { signingEnvironment } from "./signing";

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
      env: { ...signingEnvironment(process.env, { smoke: true }), ...values },
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
  const arch = { x64: "amd64", arm64: "arm64" }[options.arch ?? process.arch];
  if (!arch || !target.split(/[\\/]/).includes("native-smoke"))
    throw new Error("Refusing to install outside the native-smoke output");
  const manifest = await Bun.file(resolve(import.meta.dirname, "../../package.json")).json();
  const installer = join(target, `raypx-test-setup-${manifest.version}-${arch}.exe`);
  await regularFile(installer);
  const [expectedMain, expectedCli, cliBuild] = await Promise.all([
    digest(join(target, "Raypx Test.exe")),
    digest(join(target, "bin/raypx.exe")),
    digest(cli),
  ]);
  if (expectedCli.sha256 !== cliBuild.sha256)
    throw new Error("Packaged NSIS CLI differs from the compiled CLI");
  const keys = {
    product: "Software\\Raypx\\NativeSmokeUnused",
    uninstall:
      "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.raypx.desktop.native-smoke",
  };
  const run = options.commands ?? commands;
  const registered = () => run.registrations(keys);
  if ((await registered()).some((entry) => entry.product || entry.uninstall))
    throw new Error("Existing Raypx Test installation found; refusing to replace it");
  const root = await mkdtemp(join(tmpdir(), "raypx-nsis-smoke-"));
  const directory = join(root, "Raypx Test");
  if (/["\r\n]/.test(directory)) throw new Error("Unsafe smoke install directory");
  const binary = join(directory, "Raypx Test.exe");
  const uninstaller = join(directory, "Uninstall.exe");
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
    // Remove only registrations in the owned temporary installation.
    // Remove only our matching product key, never its shared manufacturer parent.
    await run.clearProduct(keys, directory);
    if ((await registered()).some((entry) => entry.product || entry.uninstall))
      throw new Error(`Smoke installation registration remained; retained ${root}`);
    await rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
    disposed = true;
  }
  try {
    // MyGo uses a per-user installer; /D= selects only our isolated directory.
    // /D= must be the final, unquoted tail, including any spaces in the owned path.
    await run.execute(installer, `/S /D=${directory}`);
    const entries = (await registered()).filter((entry) => entry.product || entry.uninstall);
    if (
      !entries.some(
        (entry) =>
          entry.view === (arch === "386" ? "Registry32" : "Registry64") &&
          entry.uninstall &&
          sameLocation(entry.installLocation, directory),
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
      digest(join(directory, "bin/raypx.exe")),
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
