import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./harness.ts";

test("deadline rejects even when the process handles termination with exit zero", async () => {
  let timeoutError: unknown;
  try {
    await run(
      "node",
      ["-e", "process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"],
      tmpdir(),
      1000,
    );
  } catch (error) {
    timeoutError = error;
  }
  expect(timeoutError).toBeInstanceOf(Error);
  expect(timeoutError).toMatchObject({ message: expect.stringContaining("timed out") });
});

test("timeout kills its process group when a descendant retains the output pipe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-consumer-cleanup-"));
  try {
    await writeFile(
      join(directory, "parent.mjs"),
      `
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
const child=spawn(process.execPath,["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:["ignore","inherit","inherit"]});
writeFileSync("child.pid",String(child.pid));
setInterval(()=>{},1000);
`,
    );
    let timeoutError: unknown;
    try {
      await run("node", ["parent.mjs"], directory, 1000);
    } catch (error) {
      timeoutError = error;
    }
    expect(timeoutError).toBeInstanceOf(Error);
    const pid = Number(await readFile(join(directory, "child.pid"), "utf8"));
    let alive = true;
    const deadline = Date.now() + 2000;
    while (alive && Date.now() < deadline) {
      try {
        process.kill(pid, 0);
        if (process.platform === "linux") {
          try {
            // A killed orphan can await its new parent's reap; it is no longer running.
            alive = !/\)\s+Z\s/.test(await readFile(`/proc/${pid}/stat`, "utf8"));
          } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
              throw error;
            alive = false;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
        alive = false;
      }
    }
    expect(alive).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
