import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { it, expect } from "vitest";
import { runtimeLease } from "../../../src/runtime/process/lease.js";
it("protects an old complete runtime across processes until its owner releases the lease", async () => {
  const root = await mkdtemp(join(tmpdir(), "raypx-runtime-lease-"));
  const old = join(root, "1.0.0-1"),
    next = join(root, "1.0.0-2");
  await mkdir(old);
  await mkdir(next);
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `import { runtimeLease } from ${JSON.stringify(new URL("../../../src/runtime/process/lease.ts", import.meta.url).href)}; const close = runtimeLease(${JSON.stringify(old)}); if (!close) process.exit(1); console.log("leased"); await Bun.stdin.text(); close();`,
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(first.value)).toContain("leased");
    expect(runtimeLease(old, true)).toBeUndefined();
    const releaseNext = runtimeLease(next, true);
    expect(releaseNext).toBeTypeOf("function");
    releaseNext?.();
    await child.stdin.end();
    expect(await child.exited).toBe(0);
    const releaseOld = runtimeLease(old, true);
    expect(releaseOld).toBeTypeOf("function");
    releaseOld?.();
    await rm(old, { recursive: true });
  } finally {
    child.kill();
    await child.exited;
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
