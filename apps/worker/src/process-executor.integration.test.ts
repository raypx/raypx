import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import { InMemoryCloudRepository } from "@raypx/db";
import { defaultCloudLimits } from "@raypx/core";
import { createProcessExecutor } from "./process-executor.js";

async function fixture(source: string, duration = 500) {
  const directory = await mkdtemp(join(tmpdir(), "raypx-host-lifetime-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const entry = join(directory, "index.mjs");
  const evidence = join(directory, "evidence.json");
  await writeFile(entry, source.replaceAll("EVIDENCE_PATH", JSON.stringify(evidence)));
  const repository = new InMemoryCloudRepository({
    users: [{ id: "owner", email: "owner@example.test" }],
  });
  const limits = { ...defaultCloudLimits, taskDurationMs: duration };
  const app = createCloudApplication({ repository, limits });
  const conversation = await app.createConversation({
    actorId: "owner",
    title: "Host lifetime",
    idempotencyKey: "conversation",
  });
  const { run } = await app.sendTurn({
    actorId: "owner",
    conversationId: conversation.id,
    mode: "computer",
    prompt: "Execution",
    attachmentIds: [],
    idempotencyKey: "turn",
  });
  const execute = createProcessExecutor({
    app,
    ownerId: "host",
    gatewayUrl: "http://127.0.0.1:1",
    limits,
    workerEntry: entry,
  });
  return { app, repository, run, execute, evidence, entry };
}

async function expectReleased(state: Awaited<ReturnType<typeof fixture>>) {
  const grants = await state.repository.read((tx) => tx.list("executionGrants"));
  expect(grants).toHaveLength(1);
  expect(grants[0]?.revokedAt).toBeInstanceOf(Date);
  expect(grants[0]?.actions).toEqual(["bootstrap", "invoke"]);
  expect((await state.app.getUsage({ actorId: "owner" })).activeRuns).toBe(0);
}

async function processStopped(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH")
      return true;
    throw error;
  }
  if (process.platform === "linux") {
    try {
      const status = await readFile(`/proc/${pid}/stat`, "utf8");
      // A killed orphan may briefly remain unreaped by the container's PID 1.
      return /^[ZX]$/.test(status.slice(status.lastIndexOf(")") + 2).split(" ")[0] ?? "");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return true;
      throw error;
    }
  }
  return false;
}

it.skipIf(process.platform === "win32").each([false, true])(
  "stops converter descendants and removes scratch when the Runner exits early: %s",
  async (exitsEarly) => {
    const converter = `import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
process.on("SIGTERM", () => {});
setInterval(() => {
  mkdirSync(process.cwd(), { recursive: true });
  writeFileSync(join(process.cwd(), "converter-active"), String(Date.now()));
}, 20);
process.stdout.write("ready");
`;
    const state = await fixture(
      `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
process.on("message", () => {});
const converter = spawn(process.execPath, ["--no-env-file", "--no-install", "-e", ${JSON.stringify(converter)}], {
  stdio: ["ignore", "pipe", "ignore"],
});
converter.stdout.once("data", () => {
  let ownGroup = false;
  try { process.kill(-process.pid, 0); ownGroup = true; } catch {}
  writeFileSync(EVIDENCE_PATH, JSON.stringify({ pid: process.pid, converterPid: converter.pid, directory: process.cwd(), ownGroup, runtime: process.versions.bun }));
  process.send({ type: "ready" });
  ${exitsEarly ? "setTimeout(() => process.exit(0), 50);" : ""}
});
setInterval(() => {}, 1000);
`,
      1500,
    );
    let evidence:
      | { pid: number; converterPid: number; directory: string; ownGroup: boolean; runtime: string }
      | undefined;
    try {
      await state.execute(state.run.id);
      evidence = JSON.parse(await readFile(state.evidence, "utf8"));
      if (!evidence) throw new Error("Missing converter process evidence.");
      expect(evidence.runtime).toBe("1.4.0");
      await expect.poll(() => processStopped(evidence!.pid), { timeout: 2000 }).toBe(true);
      await expect.poll(() => processStopped(evidence!.converterPid), { timeout: 2000 }).toBe(true);
      expect(evidence.ownGroup).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect(stat(evidence.directory)).rejects.toMatchObject({ code: "ENOENT" });
      expect(() => process.kill(process.pid, 0)).not.toThrow();
      await expectReleased(state);
    } finally {
      // A failed assertion must not leave its deliberately uncooperative converter behind.
      evidence ??= await readFile(state.evidence, "utf8")
        .then(JSON.parse)
        .catch(() => undefined);
      if (evidence) {
        for (const pid of [evidence.pid, evidence.converterPid])
          if (!(await processStopped(pid))) {
            try {
              process.kill(pid, "SIGKILL");
            } catch {}
          }
        await expect
          .poll(() => processStopped(evidence!.converterPid), { timeout: 2000 })
          .toBe(true);
        await rm(evidence.directory, { recursive: true, force: true });
      }
    }
  },
  15_000,
);

it("waits for child readiness before sending the task through the single entry", async () => {
  const state = await fixture(
    `import { writeFile } from "node:fs/promises";
setTimeout(() => {
  process.on("message", async message => {
    if (message.type !== "start") return;
    await writeFile(EVIDENCE_PATH, JSON.stringify({ pid: process.pid, mode: process.argv.slice(2), directory: message.bootstrap.directory, cwd: process.cwd() }));
    process.send({ type: "done" });
    process.disconnect();
  });
  process.send({ type: "ready" });
}, 100);
`,
    2000,
  );
  await state.execute(state.run.id);
  const evidence = JSON.parse(await readFile(state.evidence, "utf8"));
  expect(evidence.pid).not.toBe(process.pid);
  expect(evidence.mode).toEqual(["--runner"]);
  expect(evidence.cwd).toBe(evidence.directory);
  await expect(stat(evidence.directory)).rejects.toMatchObject({ code: "ENOENT" });
  await expectReleased(state);
});

it.each([false, true])(
  "enforces the Host deadline when readiness is %s and the child ignores cancellation",
  async (ready) => {
    const state = await fixture(`import { writeFileSync } from "node:fs";
writeFileSync(EVIDENCE_PATH, JSON.stringify({ pid: process.pid, directory: process.cwd() }));
process.on("SIGTERM", () => {});
process.on("message", () => {});
${ready ? 'process.send({ type: "ready" });' : ""}
setInterval(() => {}, 1000);
`);
    await state.execute(state.run.id);
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(snapshot.run).toMatchObject({ status: "failed", error: "BUDGET_EXCEEDED" });
    const { pid, directory } = JSON.parse(await readFile(state.evidence, "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    await expectReleased(state);
  },
  10_000,
);

it("does not replace a terminal result when a child remains alive past the deadline", async () => {
  const state = await fixture(
    `process.on("message", () => {});
process.send({ type: "ready" });
setInterval(() => {}, 1000);
`,
    1000,
  );
  const execute = createProcessExecutor({
    app: {
      ...state.app,
      registerExecutionGrant: async (input) => {
        const grant = await state.app.registerExecutionGrant(input);
        // Commit inside setup before yielding to the deliberately blocked Runner.
        await state.app.finish({
          runId: input.runId,
          ownerId: input.ownerId,
          epoch: input.epoch,
          status: "needs_input",
          output: "Committed result",
        });
        return grant;
      },
    },
    ownerId: "host",
    gatewayUrl: "http://127.0.0.1:1",
    limits: { ...defaultCloudLimits, taskDurationMs: 1000 },
    workerEntry: state.entry,
  });
  await execute(state.run.id);
  expect(
    (await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id })).run,
  ).toMatchObject({ status: "needs_input", output: "Committed result", error: null });
  await expectReleased(state);
}, 10_000);

it("aborts the real Runner bootstrap request and releases its grant on Host shutdown", async () => {
  const runner = fileURLToPath(new URL("./runner.ts", import.meta.url));
  const state = await fixture(
    `import { startRunner } from ${JSON.stringify(runner)};
await startRunner();
`,
    10_000,
  );
  let received = false;
  const gateway = createServer(() => {
    received = true;
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const address = gateway.address();
  if (!address || typeof address === "string") throw new Error("Missing Gateway fixture port.");
  const controller = new AbortController();
  const execute = createProcessExecutor({
    app: state.app,
    ownerId: "host",
    gatewayUrl: `http://127.0.0.1:${address.port}`,
    limits: defaultCloudLimits,
    workerEntry: state.entry,
  });
  const operation = execute(state.run.id, controller.signal);
  try {
    const until = Date.now() + 4000;
    while (!received && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toBe(true);
  } finally {
    controller.abort();
    await operation;
    gateway.closeAllConnections();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
  }
  expect(
    (await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id })).run,
  ).toMatchObject({ status: "failed", error: "interrupted" });
  await expectReleased(state);
}, 10_000);
