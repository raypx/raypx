import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/** A profile's OS lock must already be held before reclaiming its old socket. */
export function privateSocketDirectory(
  profile: string,
  kind: "terminal" | "host",
  previous?: string,
) {
  const prefix = `/tmp/raypx-${kind}-${process.getuid?.() ?? "user"}-`;
  if (previous) {
    const old = dirname(previous);
    try {
      const directory = lstatSync(old),
        markerFile = join(old, "owner.json"),
        marker = JSON.parse(readFileSync(markerFile, "utf8"));
      if (
        old.startsWith(prefix) &&
        !old.slice(prefix.length).includes("/") &&
        previous === join(old, "host.sock") &&
        directory.isDirectory() &&
        directory.uid === process.getuid?.() &&
        marker.profile === profile &&
        marker.kind === kind
      ) {
        const socket = lstatSync(previous);
        if (socket.isSocket() && socket.uid === directory.uid) unlinkSync(previous);
        unlinkSync(markerFile);
        rmdirSync(old); // Never remove unknown contents or recurse into a stale path.
      }
    } catch {
      /* Unowned directories and unavailable paths are left intact. */
    }
  }
  const directory = mkdtempSync(prefix);
  chmodSync(directory, 0o700);
  writeFileSync(join(directory, "owner.json"), JSON.stringify({ profile, kind }), {
    flag: "wx",
    mode: 0o600,
  });
  return directory;
}
