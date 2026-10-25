import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** One owner per data directory; a live owner is never displaced. */
export function acquireDesktopInstance(directory: string): (() => void) | null {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "desktop.lock"),
    token = crypto.randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600);
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
      } finally {
        closeSync(fd);
      }
      return () => {
        try {
          if (JSON.parse(readFileSync(path, "utf8")).token === token) rmSync(path);
        } catch {
          /* A removed lock no longer belongs to this process. */
        }
      };
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST")
        throw error;
      if (!existsSync(path)) continue;
      try {
        const owner = JSON.parse(readFileSync(path, "utf8")) as { pid?: number };
        if (!Number.isInteger(owner.pid) || Number(owner.pid) < 1) return null;
        try {
          process.kill(owner.pid!, 0);
          return null;
        } catch (failure) {
          if (
            !failure ||
            typeof failure !== "object" ||
            !("code" in failure) ||
            failure.code !== "ESRCH"
          )
            return null;
        }
      } catch {
        if (Date.now() - statSync(path).mtimeMs < 30_000) return null;
      }
      const stale = `${path}.stale-${token}`;
      try {
        renameSync(path, stale);
        rmSync(stale);
      } catch {
        /* Another startup may have won. */
      }
    }
  }
  return null;
}
