import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vite-plus/test";
import { spawnTestProcess, startTestServer } from "../helpers/server.ts";

const environment = { PATH: process.env.PATH, NODE_ENV: "test" };

async function expectStopped(pid: number): Promise<void> {
  await vi.waitFor(async () => {
    try {
      process.kill(pid, 0);
      if (process.platform === "linux") {
        const state = await readFile(`/proc/${pid}/stat`, "utf8");
        if (/\)\s+Z\s/.test(state)) return;
      }
      throw new Error(`Test process ${pid} is still running`);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ESRCH" || error.code === "ENOENT")
      )
        return;
      throw error;
    }
  });
}

test("service readiness requires a successful response, uses explicit env, and stop is idempotent", async () => {
  vi.stubEnv("RAYPX_TEST_PARENT_ONLY", "synthetic-parent-sentinel");
  try {
    const server = await startTestServer({
      command: process.execPath,
      cwd: tmpdir(),
      readyPath: "/ready",
      args: (port) => [
        "-e",
        `const {createServer}=require('node:http');let probes=0;
         console.log('parentEnvPresent:'+Boolean(process.env.RAYPX_TEST_PARENT_ONLY));
         createServer((request,response)=>{
           if(request.url==='/ready'){response.statusCode=++probes<3?503:200;}
           response.end(String(probes));
         }).listen(${port},'127.0.0.1');`,
      ],
      env: () => environment,
      startupTimeoutMs: 3000,
      pollIntervalMs: 10,
    });
    try {
      expect(server.output()).toContain("parentEnvPresent:false");
      expect(await (await fetch(`${server.baseURL}/`)).text()).toBe("3");
    } finally {
      await Promise.all([server.stop(), server.stop()]);
    }
    expect((await server.exited).signal).not.toBeNull();
    await expectStopped(server.process.pid!);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("process output stays bounded while preserving stdout, stderr and exit status", async () => {
  const child = spawnTestProcess({
    command: process.execPath,
    args: [
      "-e",
      "console.log('x'.repeat(5000));console.log('stdout-tail');console.error('stderr-tail');process.exitCode=7;",
    ],
    cwd: tmpdir(),
    env: environment,
    maxOutputChars: 128,
  });
  try {
    expect(await child.exited).toEqual({ code: 7, signal: null });
    expect(child.output().length).toBeLessThanOrEqual(128);
    expect(child.output()).toContain("stdout-tail");
    expect(child.output()).toContain("stderr-tail");
  } finally {
    await child.stop();
  }
});

test("spawn failure and an early exit reject startup instead of waiting for readiness", async () => {
  await expect(
    startTestServer({
      command: "raypx-missing-test-command",
      args: () => [],
      cwd: tmpdir(),
      env: () => environment,
      startupTimeoutMs: 3000,
    }),
  ).rejects.toThrow("Test service could not start");
  await expect(
    startTestServer({
      command: process.execPath,
      args: () => ["-e", "console.error('early-exit-sentinel');process.exit(7)"],
      cwd: tmpdir(),
      env: () => environment,
      startupTimeoutMs: 3000,
    }),
  ).rejects.toThrow(/Test service exited \(7\):.*early-exit-sentinel/s);
});

test("readiness timeout terminates the service before returning the startup failure", async () => {
  let startupError: unknown;
  try {
    await startTestServer({
      command: process.execPath,
      args: (port) => [
        "-e",
        `console.log('pid:'+process.pid);require('node:http').createServer((_,response)=>{response.statusCode=503;response.end('unavailable')}).listen(${port},'127.0.0.1');`,
      ],
      cwd: tmpdir(),
      env: () => environment,
      startupTimeoutMs: 1500,
      requestTimeoutMs: 50,
      pollIntervalMs: 10,
      stopTimeoutMs: 100,
    });
  } catch (error) {
    startupError = error;
  }
  expect(startupError).toBeInstanceOf(Error);
  if (!(startupError instanceof Error)) throw new Error("Expected a startup timeout");
  expect(startupError.message).toContain("did not become ready");
  const pid = Number(startupError.message.match(/pid:(\d+)/)?.[1]);
  expect(pid).toBeGreaterThan(0);
  await expectStopped(pid);
});

test.runIf(process.platform !== "win32")(
  "stop kills a descendant retaining pipes even after its parent exits",
  async () => {
    const child = spawnTestProcess({
      command: process.execPath,
      args: [
        "-e",
        `const {spawn}=require('node:child_process');
      const descendant=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('descendant-ready');setInterval(()=>{},1000)"],{stdio:['ignore','inherit','inherit']});
      console.log('descendant:'+descendant.pid);process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`,
      ],
      cwd: tmpdir(),
      env: environment,
      stopTimeoutMs: 100,
    });
    try {
      await vi.waitFor(() => expect(child.output()).toContain("descendant-ready"));
      const pid = Number(child.output().match(/descendant:(\d+)/)?.[1]);
      expect(pid).toBeGreaterThan(0);
      await child.stop();
      await expectStopped(pid);
    } finally {
      await child.stop();
    }
  },
);
