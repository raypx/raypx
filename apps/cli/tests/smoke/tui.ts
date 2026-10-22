import assert from "node:assert/strict";
import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform === "win32") {
  throw new Error("TUI PTY smoke is unavailable on Windows: it requires POSIX pty and termios.");
}

const python = Bun.which("python3");
assert.ok(python, "TUI PTY smoke requires Python 3 with pty and termios support");

const directory = await mkdtemp(join(tmpdir(), "raypx-tui-smoke-"));
const binary = join(directory, "raypx");
const builtBinary = resolve(import.meta.dirname, "../../dist/raypx");

// The test driver alone uses Python. Keeping the PTY slave open lets it inspect
// the actual terminal attributes after the standalone executable has exited.
const driver = resolve(import.meta.dirname, "../fixtures/tui/driver.py");

try {
  await copyFile(builtBinary, binary);
  await chmod(binary, 0o700);
  const child = Bun.spawn([python, driver, binary, directory], {
    cwd: directory,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await child.exited, 0, "Standalone TUI PTY smoke failed");
} finally {
  await rm(directory, { recursive: true, force: true });
}
