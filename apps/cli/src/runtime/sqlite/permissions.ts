import { runProcessSync } from "@raypx/runtime-node/process";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { LocalError } from "../errors.js";

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
$paths = @($directory) + @('profile.sqlite','profile.sqlite-wal','profile.sqlite-shm','profile.sqlite-journal','profile.sqlite.migration-lock.sqlite','profile.sqlite.migration-lock.sqlite-wal','profile.sqlite.migration-lock.sqlite-shm','profile.sqlite.migration-lock.sqlite-journal') | ForEach-Object { if ($_ -eq $directory) { $_ } else { [System.IO.Path]::Combine($directory, $_) } }
foreach ($path in $paths) {
  $isDirectory = $path -eq $directory
  try {
    $attributes = [System.IO.File]::GetAttributes($path)
    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
        ([bool]($attributes -band [System.IO.FileAttributes]::Directory) -ne $isDirectory)) {
      throw 'Unsupported path'
    }
    if ($isDirectory) {
      $item = [System.IO.DirectoryInfo]::new($path)
      $acl = [System.Security.AccessControl.DirectorySecurity]::new()
      $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
    } else {
      $item = [System.IO.FileInfo]::new($path)
      $acl = [System.Security.AccessControl.FileSecurity]::new()
      $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
    }
    $current = $item.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Owner)
    if ($current.GetOwner([System.Security.Principal.SecurityIdentifier]) -ne $sid) {
      $acl.SetOwner($sid)
    }
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($owner in @($sid, $system)) {
      $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($owner, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
      $acl.AddAccessRule($rule)
    }
    $item.SetAccessControl($acl)
  } catch {
    $exception = $_.Exception.GetBaseException()
    # Optional SQLite files may not exist yet or can disappear during shutdown.
    if (!$isDirectory -and ($exception -is [System.IO.FileNotFoundException] -or
        $exception -is [System.IO.DirectoryNotFoundException])) { continue }
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
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
        timeout: 30_000,
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
