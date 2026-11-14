import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectorStorage } from "./storage.js";
import { acquireLock } from "../state/index.js";

it("waits for a competing native process to release the journal lock and commits once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-connector-lock-"));
  const storage = new ConnectorStorage({ dataDir: directory });
  const modulePath = new URL("../state/index.ts", import.meta.url).pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "-e",
      `import { acquireLock } from ${JSON.stringify(modulePath)}; const release = acquireLock(${JSON.stringify(storage.directory)}, "connector-state"); if (!release) process.exit(2); console.log("locked"); setTimeout(() => { release(); process.exit(0); }, 200);`,
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("locked");
    reader.releaseLock();
    const change = vi.fn((state: ReturnType<ConnectorStorage["read"]>) => {
      state.sequence++;
    });
    storage.mutate(change);
    expect(change).toHaveBeenCalledTimes(1);
    expect(storage.read().sequence).toBe(1);
    expect(await child.exited).toBe(0);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await child.exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
it("refuses a lock that stays held without running the mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-connector-lock-"));
  const storage = new ConnectorStorage({ dataDir: directory });
  const release = acquireLock(storage.directory, "connector-state");
  if (!release) throw new Error("Owned fixture lock unavailable");
  const change = vi.fn();
  try {
    expect(() => storage.mutate(change)).toThrow("Another device connector operation is running");
    expect(change).not.toHaveBeenCalled();
  } finally {
    release();
    await rm(directory, { recursive: true, force: true });
  }
});
