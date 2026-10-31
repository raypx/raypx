import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RelayRequest, SyncDevice } from "@raypx/contracts/tasks";
import type { AgentProvider, AgentTask, HumanRequest } from "@raypx/core/tasks";

// Explicit gate: existing provider credentials/configuration are used and inference is billed.
if (process.env.RAYPX_LIVE_AGENTS !== "1")
  throw new Error("Set RAYPX_LIVE_AGENTS=1 to run real Claude and Codex inference");
const smokeDirectory = process.env.RAYPX_NATIVE_SMOKE_DATA_DIR;
if (!smokeDirectory) throw new Error("Live Agent smoke requires an isolated native data directory");
const directory = smokeDirectory;
const { engine, quitDesktop } = await import("./host");
const accountId = "live-agent-acceptance";
const results: { provider: AgentProvider; checks: string[] }[] = [];
const activeStatuses = ["pending", "running", "waiting", "cancelling"];
let stage = "engine startup";

async function execute(request: RelayRequest) {
  const id =
    request.method === "tasks.create" || request.method === "tasks.followUp"
      ? request.input.id
      : crypto.randomUUID();
  const response = (await engine.request("agents.local.execute", { accountId, id, request })) as
    | { ok: true; value: unknown }
    | { ok: false; code: string };
  if (!response.ok) throw new Error(`Local operation failed: ${response.code}`);
  return response.value;
}
async function readTask(id: string) {
  return (await engine.request("agents.local.get", { accountId, id, after: 0 })) as {
    task: AgentTask;
    requests: HumanRequest[];
  };
}
async function waitFor<T>(read: () => Promise<T | undefined>, label: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    await Bun.sleep(250);
  }
  throw new Error(`Timed out: ${label}`);
}
async function decide(
  request: HumanRequest,
  decision: { type: "allow" } | { type: "deny"; note: string },
) {
  await execute({ method: "approvals.decide", input: { id: request.id, decision } });
}
async function completion(id: string) {
  return waitFor(async () => {
    const { task, requests } = await readTask(id);
    for (const request of requests.filter((item) => item.status === "pending")) {
      assert.equal(request.kind, "permission", "Unexpected approval during implementation");
      await decide(request, { type: "allow" });
    }
    return activeStatuses.includes(task.status) ? undefined : task;
  }, "task completion");
}
async function pendingPlan(id: string) {
  return waitFor(async () => {
    const { task, requests } = await readTask(id);
    assert.ok(
      activeStatuses.includes(task.status),
      `Plan terminated without approval: ${task.status}`,
    );
    const request = requests.find((item) => item.status === "pending");
    if (!request) return undefined;
    assert.equal(request.kind, "plan");
    assert.ok(request.body.trim(), "Plan preview must be reviewable");
    return request;
  }, "plan approval");
}
async function runAcceptanceTests(project: string, count: number) {
  // Bun's runner executes node:test suites and reports its summary on stderr.
  const test = Bun.spawn([process.execPath, "test", "./acceptance.test.mjs"], {
    cwd: project,
    stdout: "pipe",
    stderr: "pipe",
  });
  await new Response(test.stdout).text();
  const output = await new Response(test.stderr).text();
  assert.equal(await test.exited, 0, "Agent-generated tests failed");
  assert.match(output, new RegExp(`\\b${count} pass\\b`));
}

async function ownerEpoch() {
  const endpoint = JSON.parse(
    await readFile(join(directory, "profiles/native-smoke/daemon.json"), "utf8"),
  ) as { epoch?: unknown };
  assert.equal(typeof endpoint.epoch, "string", "Daemon owner epoch is missing");
  return endpoint.epoch;
}

try {
  assert.equal(await engine.start(), true);
  for (const provider of ["claude", "codex"] as const) {
    const checks: string[] = [];
    const project = join(directory, provider);
    await mkdir(project);
    await writeFile(join(project, "seed.txt"), "RAYPX_LIVE_7319\n");
    await writeFile(
      join(project, "AGENTS.md"),
      "This is an isolated Raypx acceptance project. Work only here. Use Bun and its built-in modules. Do not use network, skills, integrations, commit or push.\n",
    );
    const root = (await engine.request("roots.register", { path: project })) as { id: string };
    await engine.request("agents.configure", { rootId: root.id, providers: [provider] });
    const device = (await engine.request("agents.local.device", { accountId })) as SyncDevice;
    assert.equal(
      device.capabilities.find((item) => item.provider === provider)?.available,
      true,
      `${provider} CLI is unavailable`,
    );
    const create = async (prompt: string, mode: "run" | "plan" = "run") => {
      const id = crypto.randomUUID();
      await execute({
        method: "tasks.create",
        input: { id, deviceId: device.id, projectId: root.id, provider, mode, prompt },
      });
      return id;
    };
    stage = `${provider}: real file read`;
    const read = await completion(
      await create(
        "Read seed.txt using a file tool, then return its exact contents. Do not modify files.",
      ),
    );
    assert.equal(read.status, "succeeded");
    assert.match(read.summary, /RAYPX_LIVE_7319/);
    checks.push("read");

    stage = `${provider}: plan rejection`;
    const rejected = await create(
      "Propose a plan to create rejected.txt. Request approval before writing and do not write unless approved.",
      "plan",
    );
    await decide(await pendingPlan(rejected), { type: "deny", note: "" });
    assert.equal((await completion(rejected)).status, "cancelled");
    assert.equal(await Bun.file(join(project, "rejected.txt")).exists(), false);
    checks.push("reject-plan");

    stage = `${provider}: plan approval and implementation`;
    const planned = await create(
      "Plan an implementation: acceptance.mjs exports add(a,b); acceptance.test.mjs uses node:test to verify add(2,3) === 5. Inspect this directory and present a plan for approval. Do not write either file until approved. After approval implement both and run bun test ./acceptance.test.mjs.",
      "plan",
    );
    const plan = await pendingPlan(planned);
    assert.equal(await Bun.file(join(project, "acceptance.mjs")).exists(), false);
    await decide(plan, { type: "allow" });
    assert.equal((await completion(planned)).status, "succeeded");
    await runAcceptanceTests(project, 1);
    checks.push("approve-plan", "write-and-test");

    stage = `${provider}: process restart and session resume`;
    const previousOwner = process.platform === "darwin" ? await ownerEpoch() : undefined;
    await engine.stop();
    if (process.platform === "darwin") {
      assert.equal(await engine.replaceOwner(), true, "Independent owner restart failed");
      assert.notEqual(
        await ownerEpoch(),
        previousOwner,
        "Restart only reconnected the daemon proxy",
      );
    } else assert.equal(await engine.start(), true);
    assert.equal((await readTask(planned)).task.status, "succeeded");
    const follow = crypto.randomUUID();
    await execute({
      method: "tasks.followUp",
      input: {
        id: follow,
        parentTaskId: planned,
        prompt:
          "Continue our previous task. Add one test for add(-2,3) === 1 to the existing test file and run the tests.",
      },
    });
    assert.equal((await completion(follow)).status, "succeeded");
    assert.equal((await readTask(follow)).task.parentTaskId, planned);
    await runAcceptanceTests(project, 2);
    checks.push("restart-history", "resume-session");

    stage = `${provider}: running process cancellation`;
    const command =
      'bun -e \'const fs=require("fs");fs.writeFileSync("started.txt",String(process.pid));setTimeout(()=>fs.writeFileSync("should-not-exist.txt","finished"),60000)\'';
    const cancelled = await create(
      `Use the shell tool to run exactly this command, then wait for it: ${command}. Do not run other commands or read files. This is a cancellation test in this temporary directory.`,
    );
    await waitFor(async () => {
      const { task, requests } = await readTask(cancelled);
      assert.ok(
        activeStatuses.includes(task.status),
        "Agent did not start the cancellation fixture",
      );
      for (const request of requests.filter((item) => item.status === "pending"))
        await decide(request, { type: "allow" });
      return (await Bun.file(join(project, "started.txt")).exists()) ? true : undefined;
    }, "long-running child");
    const pid = Number(await readFile(join(project, "started.txt"), "utf8"));
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    await execute({ method: "tasks.cancel", input: { id: cancelled } });
    assert.equal((await completion(cancelled)).status, "cancelled");
    assert.throws(() => process.kill(pid, 0), "Cancelled child process is still alive");
    assert.equal(await Bun.file(join(project, "should-not-exist.txt")).exists(), false);
    checks.push("cancel-process-tree");
    results.push({ provider, checks });
    console.info(`Live Agent ${provider} passed: ${checks.join(", ")}`);
  }
} catch (error) {
  console.error(`Live Agent acceptance failed at ${stage}`);
  throw error;
} finally {
  try {
    await engine.stop();
  } finally {
    await quitDesktop();
  }
}
console.info(JSON.stringify({ status: "passed", results }));
