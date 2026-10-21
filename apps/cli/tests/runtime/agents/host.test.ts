import { afterEach, expect, it } from "vite-plus/test";
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../../../src/runtime/state";
import { AgentRuntime } from "../../../src/runtime/agents";
import { AgentStore } from "../../../src/runtime/agents/store";
import type { AgentTask, AgentProvider } from "@raypx/contracts/tasks";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function host(provider: AgentProvider, code: string) {
  const directory = mkdtempSync(join(tmpdir(), "raypx-agent-"));
  const file = join(directory, provider);
  writeFileSync(
    file,
    `#!${process.execPath}\nif(process.argv.includes('--version')) { console.log('${provider === "codex" ? "codex-cli 0.163.0" : "2.1.302 (Claude Code)"}'); process.exit(0); }\n` +
      code,
    { mode: 0o700 },
  );
  const state = new StateStore(directory);
  const rootId = crypto.randomUUID();
  state.putRoot({
    id: rootId,
    name: "Project",
    path: directory,
    createdAt: new Date().toISOString(),
  });
  const runtime = new AgentRuntime(state, () => {}, { executables: { [provider]: file } });
  runtime.configure(rootId, [provider]);
  await runtime.capabilities();
  cleanups.push(async () => {
    await runtime.close();
    state.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const task: AgentTask = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: rootId,
    provider,
    mode: "run",
    prompt: "Task with private text",
    status: "pending",
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { runtime, task, directory, state };
}
const codexFixture = `
import { appendFileSync } from 'node:fs';
appendFileSync('starts','start\\n');
const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
let buffer='';
process.stdin.on('data',chunk=>{ buffer+=chunk.toString(); let n; while((n=buffer.indexOf('\\n'))>=0){ const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line)continue;const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'thread-test'}}});
if(m.method==='turn/start'){send({id:m.id,result:{}});send({id:'approval',method:'item/commandExecution/requestApproval',params:{command:'bun test',reason:'Run tests'}});}
if(m.id==='approval'){if(m.result.decision==='accept'){send({method:'item/agentMessage/delta',params:{delta:'Tests passed'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}else send({method:'turn/completed',params:{turn:{status:'failed'}}});}
}});
`;
it("routes Codex permission requests and deduplicates command replay", async () => {
  const { runtime, task, directory } = await host("codex", codexFixture);
  const commandId = crypto.randomUUID();
  const start = () =>
    runtime.start("binding", commandId, task, new Date(Date.now() + 60_000).toISOString());
  await start();
  await start();
  await expect
    .poll(() => runtime.events("binding").events.some((item) => item.kind === "request"))
    .toBe(true);
  const request = runtime.events("binding").events.find((event) => event.kind === "request");
  if (request?.kind !== "request") throw new Error("Missing request");
  await runtime.command("binding", {
    id: crypto.randomUUID(),
    type: "decision",
    taskId: task.id,
    requestId: request.request.id,
    decision: { type: "allow" },
  });
  await expect
    .poll(() =>
      runtime
        .events("binding")
        .events.some((item) => item.kind === "status" && item.status === "succeeded"),
    )
    .toBe(true);
  expect(readFileSync(join(directory, "starts"), "utf8").trim().split("\n")).toHaveLength(1);
});
it("keeps current project directories mutually exclusive and cancels waiting children", async () => {
  const { runtime, task } = await host("codex", codexFixture);
  await runtime.start(
    "binding",
    crypto.randomUUID(),
    task,
    new Date(Date.now() + 60_000).toISOString(),
  );
  const second = { ...task, id: crypto.randomUUID() };
  await runtime.start(
    "binding",
    crypto.randomUUID(),
    second,
    new Date(Date.now() + 60_000).toISOString(),
  );
  expect(runtime.events("binding").events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ taskId: second.id, status: "failed", summary: "PROJECT_BUSY" }),
    ]),
  );
  await runtime.detach("binding");
  await expect
    .poll(() =>
      runtime
        .events("binding")
        .events.some(
          (event) =>
            event.kind === "status" && event.taskId === task.id && event.status === "cancelled",
        ),
    )
    .toBe(true);
});
it.skipIf(process.platform === "win32")(
  "holds the project lock and detach until a stubborn descendant stops",
  async () => {
    const tool = `import {writeFileSync} from 'node:fs';process.on('SIGTERM',()=>{});writeFileSync('descendant-ready','ready');setInterval(()=>writeFileSync('heartbeat',String(Date.now())),5);`;
    const { runtime, task, directory } = await host(
      "codex",
      `import {writeFileSync} from 'node:fs';writeFileSync('parent-pid',String(process.pid));Bun.spawn([process.execPath,'-e',${JSON.stringify(tool)}],{stdout:'ignore',stderr:'ignore'});\n` +
        codexFixture,
    );
    const deadline = new Date(Date.now() + 60_000).toISOString();
    await runtime.start("binding", crypto.randomUUID(), task, deadline);
    await expect.poll(() => existsSync(join(directory, "heartbeat"))).toBe(true);
    const parentPid = Number(readFileSync(join(directory, "parent-pid"), "utf8"));
    let detached = false;
    const stopping = runtime.detach("binding").then(() => {
      detached = true;
    });
    await expect
      .poll(
        () => {
          try {
            process.kill(parentPid, 0);
            return true;
          } catch {
            return false;
          }
        },
        { interval: 5 },
      )
      .toBe(false);
    expect(detached).toBe(false);
    expect(
      runtime
        .events("binding")
        .events.some((event) => event.kind === "status" && event.status === "cancelled"),
    ).toBe(false);
    const second = { ...task, id: crypto.randomUUID() };
    await runtime.start("binding", crypto.randomUUID(), second, deadline);
    expect(runtime.events("binding").events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: second.id, status: "failed", summary: "PROJECT_BUSY" }),
      ]),
    );
    await stopping;
    const heartbeat = readFileSync(join(directory, "heartbeat"), "utf8");
    await Bun.sleep(40);
    expect(readFileSync(join(directory, "heartbeat"), "utf8")).toBe(heartbeat);
    const next = { ...task, id: crypto.randomUUID() };
    await runtime.start("binding", crypto.randomUUID(), next, deadline);
    expect(runtime.events("binding").events).toEqual(
      expect.arrayContaining([expect.objectContaining({ taskId: next.id, status: "running" })]),
    );
  },
);
it("cancels a start still discovering the provider when the binding detaches", async () => {
  const { runtime, task, directory } = await host("codex", codexFixture);
  const starting = runtime.start(
    "binding",
    crypto.randomUUID(),
    task,
    new Date(Date.now() + 60_000).toISOString(),
  );
  await runtime.detach("binding");
  await starting;
  expect(runtime.events("binding").events).toEqual(
    expect.arrayContaining([expect.objectContaining({ taskId: task.id, status: "cancelled" })]),
  );
  expect(() => readFileSync(join(directory, "starts"))).toThrow("ENOENT");
});
it("answers Claude questions through session-scoped hooks without touching settings files", async () => {
  const code = `const settings=JSON.parse(process.argv[process.argv.indexOf('--settings')+1]);const hook=settings.hooks.PreToolUse[0].hooks[0];
const response=await fetch(hook.url,{method:'POST',headers:{Authorization:'Bearer '+process.env.RAYPX_AGENT_HOOK_TOKEN,'content-type':'application/json'},body:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'AskUserQuestion',tool_input:{questions:[{question:'Which option?',options:[{label:'A',description:'First'}],multiSelect:false}]}})});
const decision=await response.json();console.log(JSON.stringify({type:'result',is_error:false,result:decision.hookSpecificOutput.updatedInput.answers['Which option?']}));`;
  const { runtime, task, directory } = await host("claude", code);
  await runtime.start(
    "binding",
    crypto.randomUUID(),
    task,
    new Date(Date.now() + 60_000).toISOString(),
  );
  await expect
    .poll(() => runtime.events("binding").events.some((event) => event.kind === "request"))
    .toBe(true);
  const request = runtime.events("binding").events.find((event) => event.kind === "request");
  if (request?.kind !== "request") throw new Error("Missing request");
  await runtime.command("binding", {
    id: crypto.randomUUID(),
    type: "decision",
    taskId: task.id,
    requestId: request.request.id,
    decision: { type: "answer", answers: { "0": ["A"] } },
  });
  await expect
    .poll(() =>
      runtime
        .events("binding")
        .events.some(
          (event) =>
            event.kind === "status" && event.status === "succeeded" && event.summary === "A",
        ),
    )
    .toBe(true);
  expect(() => readFileSync(join(directory, ".claude/settings.json"))).toThrow("ENOENT");
});
it("denies an oversized Claude plan without offering approval for a truncated preview", async () => {
  const code = `const settings=JSON.parse(process.argv[process.argv.indexOf('--settings')+1]);const hook=settings.hooks.PreToolUse[0].hooks[0];
const response=await fetch(hook.url,{method:'POST',headers:{Authorization:'Bearer '+process.env.RAYPX_AGENT_HOOK_TOKEN,'content-type':'application/json'},body:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'ExitPlanMode',tool_input:{plan:'x'.repeat(129000)}})});
const decision=await response.json();console.log(JSON.stringify({type:'result',is_error:false,result:decision.hookSpecificOutput.permissionDecision}));`;
  const { runtime, task } = await host("claude", code);
  await runtime.start(
    "binding",
    crypto.randomUUID(),
    { ...task, mode: "plan" },
    new Date(Date.now() + 60_000).toISOString(),
  );
  await expect
    .poll(() =>
      runtime
        .events("binding")
        .events.some(
          (event) =>
            event.kind === "status" && event.status === "succeeded" && event.summary === "deny",
        ),
    )
    .toBe(true);
  expect(runtime.events("binding").events.some((event) => event.kind === "request")).toBe(false);
});
it("recovers an ambiguous persisted execution as interrupted instead of starting it again", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-agent-recovery-"));
  const state = new StateStore(directory);
  const store = new AgentStore(directory);
  const task: AgentTask = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex",
    mode: "run",
    prompt: "Private",
    status: "running",
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const id = crypto.randomUUID();
  store.accept({ task, binding: "binding", sessionId: null }, id);
  store.close();
  const runtime = new AgentRuntime(state, () => {});
  await runtime.start("binding", id, task, new Date(Date.now() + 60_000).toISOString());
  expect(runtime.events("binding").events).toEqual([
    expect.objectContaining({ status: "interrupted" }),
  ]);
  await runtime.close();
  state.close();
  rmSync(directory, { recursive: true, force: true });
});

it("deduplicates relayed starts and accepts only the first valid approval on the host", async () => {
  const { runtime, task, directory } = await host("codex", codexFixture);
  const command = {
    id: task.id,
    deviceId: task.deviceId,
    expiresAt: new Date(Date.now() + 15_000).toISOString(),
    request: {
      method: "tasks.create" as const,
      input: {
        id: task.id,
        deviceId: task.deviceId,
        projectId: task.projectId,
        provider: task.provider,
        mode: task.mode,
        prompt: task.prompt,
      },
    },
  };
  const [first, replayed] = await Promise.all([
    runtime.remote("binding", command),
    runtime.remote("binding", command),
  ]);
  expect(first.ok).toBe(true);
  expect(replayed.ok).toBe(true);
  await expect
    .poll(() => runtime.events("binding").events.some((event) => event.kind === "request"))
    .toBe(true);
  const requestEvent = runtime.events("binding").events.find((event) => event.kind === "request");
  if (requestEvent?.kind !== "request") throw new Error("Missing request");
  const decision = (type: "allow" | "deny") =>
    runtime.remote("binding", {
      id: crypto.randomUUID(),
      deviceId: task.deviceId,
      expiresAt: new Date(Date.now() + 15_000).toISOString(),
      request: {
        method: "approvals.decide",
        input: {
          id: requestEvent.request.id,
          decision: type === "allow" ? { type: "allow" } : { type: "deny", note: "No" },
        },
      },
    });
  const decisions = await Promise.all([decision("allow"), decision("deny")]);
  expect(decisions.filter((result) => result.ok)).toHaveLength(1);
  expect(decisions.find((result) => !result.ok)).toMatchObject({ code: "ALREADY_RESOLVED" });
  await expect
    .poll(() =>
      runtime
        .events("binding")
        .events.some((event) => event.kind === "status" && event.status === "succeeded"),
    )
    .toBe(true);
  expect(readFileSync(join(directory, "starts"), "utf8").trim().split("\n")).toHaveLength(1);
  expect(
    await runtime.remote("binding", {
      ...command,
      request: { ...command.request, input: { ...command.request.input, prompt: "Different" } },
    }),
  ).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
});
it("replays acknowledged events and captures a consistent snapshot while live state advances", async () => {
  const { runtime, task } = await host("codex", codexFixture);
  await runtime.start(
    "binding",
    crypto.randomUUID(),
    task,
    new Date(Date.now() + 60_000).toISOString(),
  );
  await expect
    .poll(() => runtime.events("binding").events.some((event) => event.kind === "request"))
    .toBe(true);
  const before = runtime.replay("binding", 0),
    snapshot = runtime.snapshot("binding");
  runtime.ack(
    "binding",
    before.events.map((item) => item.event.id),
  );
  expect(runtime.events("binding").events).toEqual([]);
  expect(runtime.replay("binding", 0).events).toEqual(before.events);
  await runtime.detach("binding");
  expect(runtime.snapshot("binding", snapshot.id).records).toEqual(snapshot.records);
  const changes = runtime.replay("binding", snapshot.sequence).events;
  expect(
    changes.some((item) => item.event.kind === "status" && item.event.status === "cancelled"),
  ).toBe(true);
  expect(
    changes.some(
      (item) => item.event.kind === "request" && item.event.request.status === "cancelled",
    ),
  ).toBe(true);
});
it("does not execute an expired relayed command", async () => {
  const { runtime, task, directory } = await host("codex", codexFixture);
  const result = await runtime.remote("binding", {
    id: task.id,
    deviceId: task.deviceId,
    expiresAt: new Date(Date.now() - 1).toISOString(),
    request: {
      method: "tasks.create",
      input: {
        id: task.id,
        deviceId: task.deviceId,
        projectId: task.projectId,
        provider: task.provider,
        mode: task.mode,
        prompt: task.prompt,
      },
    },
  });
  expect(result).toMatchObject({ ok: false, code: "DELIVERY_EXPIRED" });
  expect(existsSync(join(directory, "starts"))).toBe(false);
});
