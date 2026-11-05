import { runProcessSync } from "@raypx/runtime-node/process";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { LocalError } from "../errors.ts";

const files = ["profile.sqlite", "profile.sqlite.migration-lock.sqlite"].flatMap((file) => [
  file,
  `${file}-wal`,
  `${file}-shm`,
  `${file}-journal`,
]);

// A protected inheritable directory ACL also protects SQLite files created after startup.
const windowsPermissions = String.raw`
$ErrorActionPreference = 'Stop'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$directory = $env:RAYPX_PRIVATE_PROFILE
$paths = @($directory) + @('profile.sqlite','profile.sqlite-wal','profile.sqlite-shm','profile.sqlite-journal','profile.sqlite.migration-lock.sqlite','profile.sqlite.migration-lock.sqlite-wal','profile.sqlite.migration-lock.sqlite-shm','profile.sqlite.migration-lock.sqlite-journal') | ForEach-Object { if ($_ -eq $directory) { $_ } else { Join-Path $directory $_ } }
foreach ($path in $paths) {
  if (!(Test-Path -LiteralPath $path)) { continue }
  try {
  $item = Get-Item -Force -LiteralPath $path
  if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Unsupported path' }
  if ($item.PSIsContainer) {
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
  } else {
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
  }
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($owner in @($sid, $system)) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($owner, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $path -AclObject $acl
  } catch {
    # Another SQLite connection may remove a transient sidecar after Test-Path.
    if (($path -match '-(wal|shm|journal)$') -and !(Test-Path -LiteralPath $path)) { continue }
    throw
  }
}
`;

export function protectProfile(directory: string) {
  if (!isAbsolute(directory))
    throw new LocalError("INVALID_PROFILE", "Profile directory must be absolute");
  const regular = (path: string, isDirectory: boolean) => {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (isDirectory ? !stat.isDirectory() : !stat.isFile()))
        throw new LocalError("UNSUPPORTED_SCHEMA", "Profile storage must use regular local paths");
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  regular(directory, true);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const existing = files
    .map((file) => join(directory, file))
    .filter((file) => regular(file, false));
  try {
    if (process.platform === "win32") {
      const root = process.env.SystemRoot;
      if (!root || !isAbsolute(root)) throw new Error("Windows system directory unavailable");
      const result = runProcessSync({
        cmd: [
          join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(windowsPermissions, "utf16le").toString("base64"),
        ],
        env: { ...process.env, RAYPX_PRIVATE_PROFILE: directory },
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
        timeout: 15_000,
      });
      if (result.exitCode !== 0) throw new Error("Private ACL unavailable");
    } else {
      chmodSync(directory, 0o700);
      for (const file of existing) {
        try {
          chmodSync(file, 0o600);
        } catch (error) {
          // Closing another connection can remove WAL/SHM/journal files between lstat and chmod.
          if (
            !/-(wal|shm|journal)$/.test(file) ||
            (error as NodeJS.ErrnoException).code !== "ENOENT"
          )
            throw error;
        }
      }
    }
  } catch {
    throw new LocalError("PROFILE_STORAGE_UNAVAILABLE", "Unable to protect profile storage");
  }
}
