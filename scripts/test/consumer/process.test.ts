import { expect, test } from "vite-plus/test";
import { getEventListeners } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, withRunOptions } from "../../lib/process.ts";

async function expectStopped(pid: number) {
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
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
          alive = false;
        }
      }
      if (alive) await new Promise((resolve) => setTimeout(resolve, 25));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      alive = false;
    }
  }
  expect(alive).toBe(false);
}

async function cleanupDescendant(directory: string) {
  try {
    const pid = Number(await readFile(join(directory, "child.pid"), "utf8"));
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        ["ENOENT", "ESRCH"].includes(String(error.code))
      )
    )
      throw error;
  }
  await rm(directory, { recursive: true, force: true });
}

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

test.skipIf(process.platform === "win32")(
  "timeout kills its process group when a descendant retains the output pipe",
  async () => {
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
        await run("node", ["parent.mjs"], directory, 3000);
      } catch (error) {
        timeoutError = error;
      }
      expect(timeoutError).toBeInstanceOf(Error);
      const pid = Number(await readFile(join(directory, "child.pid"), "utf8"));
      await expectStopped(pid);
    } finally {
      await cleanupDescendant(directory);
    }
  },
  15_000,
);

test("pre-aborted calls do not spawn a process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-process-pre-abort-"));
  const controller = new AbortController();
  controller.abort("cancelled before starting");
  try {
    await expect(
      run(
        "node",
        ["-e", "require('node:fs').writeFileSync('spawned','yes')"],
        directory,
        10_000,
        {},
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(readFile(join(directory, "spawned"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("running cancellation rejects even when SIGTERM exits successfully", async () => {
  const controller = new AbortController();
  const operation = run(
    "node",
    [
      "-e",
      "process.on('SIGTERM',()=>process.exit(0));console.log('READY');setInterval(()=>{},1000)",
    ],
    tmpdir(),
    10_000,
    {},
    {
      signal: controller.signal,
      onOutput: (chunk) => {
        if (chunk.includes("READY")) controller.abort("operator cancellation");
      },
    },
  );
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
  await expect(operation).rejects.toMatchObject({
    name: "AbortError",
    message: expect.stringContaining("READY"),
  });
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

test.skipIf(process.platform === "win32")(
  "cancellation escalates for a descendant that ignores SIGTERM",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-process-abort-group-"));
    const controller = new AbortController();
    try {
      await writeFile(
        join(directory, "parent.mjs"),
        `
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
process.on("SIGTERM",()=>process.exit(0));
const child=spawn(process.execPath,["-e", "process.on('SIGTERM',()=>{});console.log('READY');setInterval(()=>{},1000)"],{stdio:["ignore","inherit","inherit"]});
writeFileSync("child.pid",String(child.pid));
setInterval(()=>{},1000);
`,
      );
      const started = Date.now();
      await expect(
        run(
          "node",
          ["parent.mjs"],
          directory,
          10_000,
          {},
          {
            signal: controller.signal,
            onOutput: (chunk) => {
              if (chunk.includes("READY")) controller.abort();
            },
          },
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
      // The descendant's handler forces the real 5s escalation path.
      expect(Date.now() - started).toBeGreaterThanOrEqual(5000);
      await expectStopped(Number(await readFile(join(directory, "child.pid"), "utf8")));
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally {
      await cleanupDescendant(directory);
    }
  },
  15_000,
);

test.skipIf(process.platform === "win32").each(["inherit", "ignore"] as const)(
  "successful parent exit cleans up a descendant with %s output pipes",
  async (outputMode) => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-process-orphan-"));
    try {
      await writeFile(
        join(directory, "parent.mjs"),
        `
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
const child=spawn(process.execPath,["-e", "process.on('SIGTERM',()=>process.exit(0));process.send('ready');setInterval(()=>{},1000)"],{stdio:["ignore",${JSON.stringify(outputMode)},${JSON.stringify(outputMode)},"ipc"]});
child.once("message",()=>{writeFileSync("child.pid",String(child.pid));process.exit(0)});
`,
      );
      await expect(run("node", ["parent.mjs"], directory, 10_000)).resolves.toBe("");
      await expectStopped(Number(await readFile(join(directory, "child.pid"), "utf8")));
    } finally {
      await cleanupDescendant(directory);
    }
  },
  15_000,
);

test("output callbacks stream both pipes before completion and preserve capture", async () => {
  const chunks: { chunk: string; stream: "stdout" | "stderr" }[] = [];
  let complete = false;
  const output = await run(
    "node",
    [
      "-e",
      "process.stdout.write('OUT');setTimeout(()=>process.stderr.write('ERR'),100);setTimeout(()=>{},200)",
    ],
    tmpdir(),
    10_000,
    {},
    {
      onOutput: (chunk, stream) => {
        expect(complete).toBe(false);
        chunks.push({ chunk, stream });
      },
    },
  );
  complete = true;
  expect(
    chunks
      .filter(({ stream }) => stream === "stdout")
      .map(({ chunk }) => chunk)
      .join(""),
  ).toBe("OUT");
  expect(
    chunks
      .filter(({ stream }) => stream === "stderr")
      .map(({ chunk }) => chunk)
      .join(""),
  ).toBe("ERR");
  expect(output).toBe(chunks.map(({ chunk }) => chunk).join(""));
});

test("capture retains a bounded tail while live output includes earlier chunks", async () => {
  let streamed = "";
  const output = await run(
    "node",
    [
      "-e",
      "process.stdout.write('START'+'x'.repeat(260000),()=>setTimeout(()=>process.stderr.write('END'),25))",
    ],
    tmpdir(),
    10_000,
    {},
    {
      onOutput: (chunk) => {
        streamed += chunk;
      },
    },
  );
  expect(streamed).toHaveLength(260_008);
  expect(streamed.startsWith("START")).toBe(true);
  expect(output).toHaveLength(200_000);
  expect(output.startsWith("START")).toBe(false);
  expect(output.endsWith("END")).toBe(true);
});

test.each([
  { name: "success", script: "process.stdout.write('done')", timeout: 10_000, succeeds: true },
  { name: "failure", script: "process.exit(2)", timeout: 10_000, succeeds: false },
  { name: "timeout", script: "setInterval(()=>{},1000)", timeout: 250, succeeds: false },
])("$name removes the AbortSignal listener", async ({ script, timeout, succeeds }) => {
  const controller = new AbortController();
  const operation = run(
    "node",
    ["-e", script],
    tmpdir(),
    timeout,
    {},
    { signal: controller.signal },
  );
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
  const results = await Promise.allSettled([operation]);
  const expectedError = expect.any(Error);
  expect(results).toEqual(
    succeeds
      ? [{ status: "fulfilled", value: "done" }]
      : [{ status: "rejected", reason: expectedError }],
  );
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  controller.abort();
});

test("an output callback failure rejects once and cleans up the child", async () => {
  const error = new Error("output sink failed");
  const controller = new AbortController();
  let calls = 0;
  await expect(
    run(
      "node",
      [
        "-e",
        "process.on('SIGTERM',()=>process.exit(0));console.log('READY');setInterval(()=>console.log('tick'),20)",
      ],
      tmpdir(),
      10_000,
      {},
      {
        signal: controller.signal,
        onOutput: () => {
          calls += 1;
          throw error;
        },
      },
    ),
  ).rejects.toBe(error);
  expect(calls).toBe(1);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

test("spawn errors also release the cancellation listener", async () => {
  const controller = new AbortController();
  await expect(
    run(
      "raypx-process-command-does-not-exist",
      [],
      tmpdir(),
      10_000,
      {},
      {
        signal: controller.signal,
      },
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

test("run scopes stay isolated across concurrent operations and after completion", async () => {
  const controller = new AbortController();
  const firstChunks: string[] = [];
  const secondChunks: string[] = [];
  const first = withRunOptions(
    {
      signal: controller.signal,
      onOutput: (chunk) => {
        firstChunks.push(chunk);
        controller.abort();
      },
    },
    () => run("node", ["-e", "console.log('first');setInterval(()=>{},1000)"], tmpdir(), 10_000),
  );
  const second = withRunOptions({ onOutput: (chunk) => secondChunks.push(chunk) }, () =>
    run("node", ["-e", "console.log('second')"], tmpdir(), 10_000),
  );
  const results = await Promise.allSettled([first, second]);
  expect(results[0]).toMatchObject({ status: "rejected", reason: { name: "AbortError" } });
  expect(results[1]).toEqual({ status: "fulfilled", value: "second\n" });
  expect(firstChunks.join("")).toBe("first\n");
  expect(secondChunks.join("")).toBe("second\n");
  await expect(run("node", ["-e", "console.log('outside')"], tmpdir(), 10_000)).resolves.toBe(
    "outside\n",
  );
  expect(firstChunks.join("")).toBe("first\n");
  expect(secondChunks.join("")).toBe("second\n");
});

test("nested scopes inherit defaults and explicit run options take priority", async () => {
  const controller = new AbortController();
  const inherited: string[] = [];
  await withRunOptions(
    { signal: controller.signal, onOutput: (chunk) => inherited.push(chunk) },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return withRunOptions({}, () =>
        run("node", ["-e", "console.log('nested')"], tmpdir(), 10_000),
      );
    },
  );
  expect(inherited.join("")).toBe("nested\n");

  controller.abort();
  const explicit: string[] = [];
  const live = new AbortController();
  await expect(
    withRunOptions({ signal: controller.signal, onOutput: (chunk) => inherited.push(chunk) }, () =>
      run(
        "node",
        ["-e", "console.log('explicit')"],
        tmpdir(),
        10_000,
        {},
        {
          signal: live.signal,
          onOutput: (chunk) => explicit.push(chunk),
        },
      ),
    ),
  ).resolves.toBe("explicit\n");
  expect(inherited.join("")).toBe("nested\n");
  expect(explicit.join("")).toBe("explicit\n");
  expect(getEventListeners(live.signal, "abort")).toHaveLength(0);
});
