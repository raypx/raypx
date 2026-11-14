import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { LocalDeviceGrant } from "./storage.js";
import { LocalError } from "../errors.js";

type NativeFiles = {
  openat(directory: number, name: Uint8Array, flags: number, mode: number): number;
  fdopendir(directory: number): number | null;
  readdir(directory: number): number | null;
  closedir(directory: number): number;
  name(pointer: number): string;
};
let native: NativeFiles | undefined;
async function nativeFiles() {
  if (native) return native;
  if (process.platform !== "darwin" && process.platform !== "linux")
    throw new LocalError(
      "CONNECTOR_PLATFORM_UNAVAILABLE",
      "Secure device file operations are unavailable on this platform",
    );
  const { CString, dlopen } = await import("bun:ffi");
  const darwinArm64 = process.platform === "darwin" && process.arch === "arm64";
  const library = dlopen(
    process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
    {
      openat: {
        args: darwinArm64
          ? ["int", "ptr", "int", "int", "int", "int", "int", "int", "int"]
          : ["int", "ptr", "int", "int"],
        returns: "int",
      },
      fdopendir: { args: ["int"], returns: "ptr" },
      readdir: { args: ["ptr"], returns: "ptr" },
      closedir: { args: ["ptr"], returns: "int" },
    },
  );
  native = {
    ...library.symbols,
    // Darwin arm64 places variadic arguments on the stack after eight register slots.
    openat: (directory: number, name: Uint8Array, flags: number, mode: number) => {
      const call = library.symbols.openat as (...args: unknown[]) => number;
      if (darwinArm64) return call(directory, name, flags, 0, 0, 0, 0, 0, mode);
      return call(directory, name, flags, mode);
    },
    name: (pointer) => new CString(pointer + (process.platform === "darwin" ? 21 : 19)),
  } as NativeFiles;
  return native;
}
export function relativeDevicePath(input: string) {
  if (
    input.length > 4096 ||
    input.includes("\0") ||
    input.includes("\\") ||
    isAbsolute(input) ||
    /^[A-Za-z]:/.test(input)
  )
    throw new LocalError("ACCESS_DENIED", "Use a path inside the granted directory");
  const parts = input.split("/").filter((part) => part && part !== ".");
  if (parts.some((part) => part === ".." || part.includes(":")))
    throw new LocalError("ACCESS_DENIED", "Path traversal is not allowed");
  return parts;
}
export function captureDeviceDirectory(directory: string): {
  directory: string;
  dev: string;
  ino: string;
} {
  if (!isAbsolute(directory) || directory.includes("\0"))
    throw new LocalError("INVALID_INPUT", "Select an absolute directory");
  const canonical = realpathSync(directory);
  const stat = lstatSync(canonical, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new LocalError("INVALID_INPUT", "Select a regular directory");
  return { directory: canonical, dev: String(stat.dev), ino: String(stat.ino) };
}
/** openat walks held directory descriptors, refusing every link component. */
export class DeviceFiles {
  private readonly protectedDirectory: string;
  constructor(directory: string) {
    try {
      this.protectedDirectory = realpathSync(directory);
    } catch {
      this.protectedDirectory = join(realpathSync(dirname(directory)), basename(directory));
    }
  }
  private protected(path: string) {
    const rel = relative(this.protectedDirectory, path);
    return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
  }
  private async openRoot(grant: LocalDeviceGrant) {
    const library = await nativeFiles();
    let fd = openSync("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      for (const part of grant.grant.directory.split("/").filter(Boolean)) {
        const next = library.openat(
          fd,
          Buffer.from(part + "\0"),
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
          0,
        );
        if (next < 0)
          throw new LocalError("ACCESS_DENIED", "Granted directory changed; confirm it again");
        closeSync(fd);
        fd = next;
      }
      const stat = fstatSync(fd, { bigint: true });
      if (String(stat.dev) !== grant.dev || String(stat.ino) !== grant.ino)
        throw new LocalError("ACCESS_DENIED", "Granted directory changed; confirm it again");
      return fd;
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  }
  private async open(
    grant: LocalDeviceGrant,
    path: string,
    write = false,
    directory = false,
    check?: () => void,
  ) {
    const parts = relativeDevicePath(path);
    if (this.protected(resolve(grant.grant.directory, ...parts)))
      throw new LocalError("ACCESS_DENIED", "Device credentials are outside file grants");
    if (write && parts.length === 0)
      throw new LocalError("ACCESS_DENIED", "Cannot overwrite the granted directory");
    const library = await nativeFiles();
    let fd = await this.openRoot(grant);
    try {
      check?.();
      for (let index = 0; index < parts.length; index++) {
        const last = index === parts.length - 1;
        let flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
        if (!last || directory) flags |= constants.O_DIRECTORY;
        if (last && write)
          flags =
            constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK;
        const next = library.openat(fd, Buffer.from(parts[index]! + "\0"), flags, 0o600);
        if (next < 0)
          throw new LocalError("ACCESS_DENIED", "Path is unavailable or contains a symbolic link");
        closeSync(fd);
        fd = next;
      }
      return fd;
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  }
  async cwd(grant: LocalDeviceGrant, path: string) {
    const parts = relativeDevicePath(path);
    const fd = await this.open(grant, path, false, true);
    closeSync(fd);
    return resolve(grant.grant.directory, ...parts);
  }
  async read(grant: LocalDeviceGrant, path: string, maxBytes: number, check?: () => void) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024 * 1024)
      throw new LocalError("LIMIT_EXCEEDED", "File budget is too large");
    const fd = await this.open(grant, path, false, false, check);
    try {
      check?.();
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new LocalError("ACCESS_DENIED", "Only regular files can be read");
      const buffer = Buffer.alloc(maxBytes);
      let total = 0;
      while (total < maxBytes) {
        const count = readSync(fd, buffer, total, maxBytes - total, total);
        if (!count) break;
        total += count;
      }
      return {
        bytes: buffer.subarray(0, total).toString("base64"),
        size: stat.size,
        truncated: stat.size > total,
      };
    } finally {
      closeSync(fd);
    }
  }
  async write(grant: LocalDeviceGrant, path: string, bytes: string, check?: () => void) {
    const buffer = Buffer.from(bytes, "base64");
    if (buffer.length > 1024 * 1024)
      throw new LocalError("LIMIT_EXCEEDED", "File budget is too large");
    const fd = await this.open(grant, path, true, false, check);
    try {
      check?.();
      if (!fstatSync(fd).isFile())
        throw new LocalError("ACCESS_DENIED", "Only regular files can be written");
      ftruncateSync(fd, 0);
      let total = 0;
      while (total < buffer.length)
        total += writeSync(fd, buffer, total, buffer.length - total, total);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  async list(grant: LocalDeviceGrant, path: string, limit: number, check?: () => void) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new LocalError("LIMIT_EXCEEDED", "Directory budget is too large");
    const library = await nativeFiles();
    const fd = await this.open(grant, path, false, true, check);
    try {
      check?.();
    } catch (error) {
      closeSync(fd);
      throw error;
    }
    const directory = library.fdopendir(fd);
    if (!directory) {
      closeSync(fd);
      throw new LocalError("ACCESS_DENIED", "Directory is unavailable");
    }
    try {
      const entries: {
        name: string;
        kind: "file" | "directory" | "symlink" | "other";
        size: number;
      }[] = [];
      let truncated = false;
      for (;;) {
        const entry = library.readdir(directory);
        if (!entry) break;
        const name = library.name(entry);
        if (name === "." || name === "..") continue;
        if (entries.length >= limit) {
          truncated = true;
          break;
        }
        const child = library.openat(
          fd,
          Buffer.from(name + "\0"),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          0,
        );
        if (child < 0) {
          entries.push({ name, kind: "symlink", size: 0 });
          continue;
        }
        try {
          const stat = fstatSync(child);
          let kind: "file" | "directory" | "other" = "other";
          if (stat.isFile()) kind = "file";
          if (stat.isDirectory()) kind = "directory";
          entries.push({ name, kind, size: stat.size });
        } finally {
          closeSync(child);
        }
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return {
        entries: entries
          .filter((entry) => entry.kind !== "other")
          .map((entry) => ({
            path: [...relativeDevicePath(path), entry.name].join("/"),
            kind: entry.kind,
          })),
        truncated,
      };
    } finally {
      library.closedir(directory);
    }
  }
}
