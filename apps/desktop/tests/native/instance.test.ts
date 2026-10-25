import { expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireDesktopInstance } from "../../native/instance";
import { externalUrl } from "../../native/external";

it("keeps exactly one owner per data directory and releases on quit", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-instance-"));
  try {
    const release = acquireDesktopInstance(directory);
    expect(release).toBeTypeOf("function");
    expect(acquireDesktopInstance(directory)).toBeNull();
    release!();
    const next = acquireDesktopInstance(directory);
    expect(next).toBeTypeOf("function");
    next!();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("only opens credential-free web links", () => {
  expect(externalUrl("https://example.test/path")).toBe("https://example.test/path");
  for (const value of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:key@example.test",
    "https://example.test/\n",
  ])
    expect(externalUrl(value)).toBeNull();
});

it("ignores obsolete PID metadata and reacquires the OS lock after a process crash", async () => {
  const { writeFileSync } = await import("node:fs");
  const directory = mkdtempSync(join(tmpdir(), "raypx-lock-crash-"));
  const source = new URL("../../native/instance.ts", import.meta.url).href;
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `import { acquireDesktopInstance } from ${JSON.stringify(source)}; const release=acquireDesktopInstance(Bun.argv.at(-1)); console.log(release ? 'owned' : 'blocked'); if(release) await Bun.sleep(60000);`,
      directory,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(first.value)).toContain("owned");
    expect(acquireDesktopInstance(directory)).toBeNull();
    child.kill("SIGKILL");
    await child.exited;
    // A reused PID and even corrupt legacy PID metadata cannot block this lock.
    writeFileSync(join(directory, "desktop.lock"), JSON.stringify({ pid: process.pid }));
    const release = acquireDesktopInstance(directory);
    expect(release).toBeTypeOf("function");
    release!();
    release!();
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

it("allows exactly one process to take over after the previous owner exits", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-lock-race-"));
  const source = new URL("../../native/instance.ts", import.meta.url).href;
  const previous = acquireDesktopInstance(directory)!;
  previous();
  const children = Array.from({ length: 6 }, () =>
    Bun.spawn(
      [
        process.execPath,
        "-e",
        `import { acquireDesktopInstance } from ${JSON.stringify(source)}; const release=acquireDesktopInstance(Bun.argv.at(-1)); console.log(release ? 'owned' : 'blocked'); if(release) { process.stdin.resume(); process.stdin.once('data',()=>{release();process.exit(0);}); }`,
        directory,
      ],
      { stdout: "pipe", stderr: "pipe", stdin: "pipe" },
    ),
  );
  try {
    const outcomes = await Promise.all(
      children.map(async (child) => {
        const reader = child.stdout.getReader();
        const result = await reader.read();
        reader.releaseLock();
        return new TextDecoder().decode(result.value).trim();
      }),
    );
    expect(outcomes.filter((value) => value === "owned")).toHaveLength(1);
    expect(outcomes.filter((value) => value === "blocked")).toHaveLength(5);
    expect(acquireDesktopInstance(directory)).toBeNull();
  } finally {
    for (const child of children) {
      child.kill();
      await child.exited;
    }
    const release = acquireDesktopInstance(directory);
    expect(release).toBeTypeOf("function");
    release?.();
    rmSync(directory, { recursive: true, force: true });
  }
});
