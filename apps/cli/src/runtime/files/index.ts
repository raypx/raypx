import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { MAX_TEXT_BYTES, type FileEntry } from "@raypx/contracts/local";
import { LocalError } from "../errors";
import { acquireLock, type StateStore } from "../state";

function version(stat: { mtimeMs: number; size: number; ino: number; ctimeMs: number }) {
  return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
export class FileRuntime {
  constructor(private readonly state: StateStore) {}
  async register(path: string) {
    const canonical = await realpath(resolve(path));
    if (!(await lstat(canonical)).isDirectory())
      throw new LocalError("NOT_DIRECTORY", "Select a directory");
    const existing = this.state.roots().find((root) => root.path === canonical);
    return (
      existing ??
      this.state.putRoot({
        id: crypto.randomUUID(),
        path: canonical,
        name: basename(canonical) || canonical,
        createdAt: new Date().toISOString(),
      })
    );
  }
  async resolve(rootId: string, path: string, allowMissing = false) {
    if (path.includes("\0") || isAbsolute(path) || /^[a-zA-Z]:/.test(path))
      throw new LocalError("INVALID_PATH", "Use a relative path inside the authorized directory");
    const segments = path
      .replaceAll("\\", "/")
      .split("/")
      .filter((entry) => entry !== "" && entry !== ".");
    if (segments.some((entry) => entry === ".." || entry.includes(":")))
      throw new LocalError("INVALID_PATH", "Path traversal is not allowed");
    const root = this.state.root(rootId);
    // Recheck the original grant as it may have been renamed/replaced externally.
    if ((await realpath(root.path)) !== root.path)
      throw new LocalError("SYMLINK", "Directory grant changed; authorize it again");
    let cursor = root.path;
    for (let index = 0; index < segments.length; index++) {
      cursor = join(cursor, segments[index]!);
      try {
        if ((await lstat(cursor)).isSymbolicLink())
          throw new LocalError("SYMLINK", "Symbolic links are not followed");
      } catch (error) {
        if (
          allowMissing &&
          index === segments.length - 1 &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        )
          return cursor;
        throw error;
      }
    }
    const rel = relative(root.path, cursor);
    if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel))
      throw new LocalError("INVALID_PATH", "Path escapes the authorized directory");
    return cursor;
  }
  async stat(rootId: string, path: string): Promise<FileEntry> {
    const file = await this.resolve(rootId, path);
    const stat = await lstat(file);
    return {
      name: basename(file),
      path,
      kind: stat.isDirectory()
        ? "directory"
        : stat.isFile()
          ? "file"
          : stat.isSymbolicLink()
            ? "symlink"
            : "other",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      version: version(stat),
    };
  }
  async list(rootId: string, path: string, offset: number, limit: number) {
    const directory = await this.resolve(rootId, path);
    const names = (await readdir(directory)).sort((a, b) => a.localeCompare(b));
    const entries = await Promise.all(
      names.slice(offset, offset + limit).map(async (name): Promise<FileEntry> => {
        const stat = await lstat(join(directory, name));
        return {
          name,
          path: [path, name].filter(Boolean).join("/"),
          kind: stat.isSymbolicLink()
            ? "symlink"
            : stat.isDirectory()
              ? "directory"
              : stat.isFile()
                ? "file"
                : "other",
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          version: version(stat),
        };
      }),
    );
    return { entries, total: names.length, offset };
  }
  async read(rootId: string, path: string) {
    const file = await this.resolve(rootId, path);
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new LocalError("NOT_FILE", "Only regular text files can be read");
      if (stat.size > MAX_TEXT_BYTES)
        throw new LocalError("TOO_LARGE", "Text files are limited to 1 MiB");
      const buffer = Buffer.alloc(MAX_TEXT_BYTES + 1);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const part = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        if (part.bytesRead === 0) break;
        bytesRead += part.bytesRead;
      }
      if (bytesRead > MAX_TEXT_BYTES)
        throw new LocalError("TOO_LARGE", "Text files are limited to 1 MiB");
      try {
        return {
          text: new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead)),
          version: version(stat),
        };
      } catch {
        throw new LocalError("NOT_UTF8", "This file is not valid UTF-8 text");
      }
    } finally {
      await handle.close();
    }
  }
  private requireChild(rootId: string, file: string) {
    if (file === this.state.root(rootId).path)
      throw new LocalError("INVALID_PATH", "Cannot modify an authorized root");
  }
  async assertVersion(file: string, expected: string | null) {
    let actual: string | null = null;
    try {
      actual = version(await lstat(file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (actual !== expected)
      throw new LocalError("CONFLICT", "File changed; reload before continuing");
  }
  private async mutate<T>(rootId: string, operation: () => Promise<T>): Promise<T> {
    this.state.root(rootId);
    // Grants can overlap. A profile-wide mutation lease also protects the same
    // file reached through a parent grant and a nested directory grant.
    const release = acquireLock(this.state.directory, "file-mutations");
    if (!release)
      throw new LocalError("BUSY", "Another local file operation is running; reload and retry");
    try {
      return await operation();
    } finally {
      release();
    }
  }
  write(rootId: string, path: string, text: string, expected: string | null) {
    return this.mutate(rootId, () => this.writeUnlocked(rootId, path, text, expected));
  }
  mkdir(rootId: string, path: string) {
    return this.mutate(rootId, () => this.mkdirUnlocked(rootId, path));
  }
  move(rootId: string, path: string, to: string, expected: string) {
    return this.mutate(rootId, () => this.moveUnlocked(rootId, path, to, expected));
  }
  delete(rootId: string, path: string, expected: string) {
    return this.mutate(rootId, () => this.deleteUnlocked(rootId, path, expected));
  }
  private async writeUnlocked(rootId: string, path: string, text: string, expected: string | null) {
    if (Buffer.byteLength(text) > MAX_TEXT_BYTES)
      throw new LocalError("TOO_LARGE", "Text files are limited to 1 MiB");
    if (!path) throw new LocalError("INVALID_PATH", "A file path is required");
    const file = await this.resolve(rootId, path, true);
    this.requireChild(rootId, file);
    await this.assertVersion(file, expected);
    let mode = 0o600;
    if (expected !== null) {
      const existing = await lstat(file);
      if (!existing.isFile()) throw new LocalError("NOT_FILE", "Only regular files can be edited");
      mode = existing.mode & 0o777;
    }
    const temporary = join(dirname(file), `.raypx-${crypto.randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(text, "utf8");
        await handle.chmod(mode);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.resolve(rootId, path, true);
      await this.assertVersion(file, expected);
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
    return { ...(await this.stat(rootId, path)), text };
  }
  private async mkdirUnlocked(rootId: string, path: string) {
    if (!path) throw new LocalError("INVALID_PATH", "A directory path is required");
    const file = await this.resolve(rootId, path, true);
    this.requireChild(rootId, file);
    await mkdir(file);
    return this.stat(rootId, path);
  }
  private async moveUnlocked(rootId: string, path: string, to: string, expected: string) {
    if (!path || !to) throw new LocalError("INVALID_PATH", "Cannot move an authorized root");
    const source = await this.resolve(rootId, path);
    const target = await this.resolve(rootId, to, true);
    this.requireChild(rootId, source);
    this.requireChild(rootId, target);
    await this.assertVersion(source, expected);
    await this.assertVersion(target, null);
    await rename(source, target);
    return this.stat(rootId, to);
  }
  private async deleteUnlocked(rootId: string, path: string, expected: string) {
    if (!path) throw new LocalError("INVALID_PATH", "Cannot delete an authorized root");
    const file = await this.resolve(rootId, path);
    this.requireChild(rootId, file);
    await this.assertVersion(file, expected);
    await rm(file, { recursive: true });
    return { deleted: true };
  }
  async scan(rootId: string, path: string, signal: AbortSignal) {
    const root = await this.resolve(rootId, path);
    const pending = [root];
    let files = 0,
      directories = 0,
      bytes = 0,
      skipped = 0;
    while (pending.length) {
      signal.throwIfAborted();
      const file = pending.pop()!;
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) {
        skipped++;
        continue;
      }
      if (stat.isDirectory()) {
        directories++;
        for (const name of await readdir(file)) pending.push(join(file, name));
      } else if (stat.isFile()) {
        files++;
        bytes += stat.size;
      }
      if (files + directories + skipped > 200_000)
        throw new LocalError("SCAN_LIMIT", "Scan is limited to 200000 entries");
      if ((files + directories + skipped) % 100 === 0) await Bun.sleep(0);
    }
    return { files, directories, bytes, skipped };
  }
}
