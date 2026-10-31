import { expect, it } from "vite-plus/test";
import { existsSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentFixtures } from "../../../helpers/agents";
import { tmpdir } from "node:os";
import { StateStore } from "../../../../src/runtime/state";
import { AgentRuntime } from "../../../../src/runtime/agents";
import { AgentStore } from "../../../../src/runtime/agents/store";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";

import type { AgentTask } from "@raypx/core/tasks";
const { host } = agentFixtures();

it("routes Codex permission requests and deduplicates command replay", async () => {
  const { runtime, task, directory, pending } = await host("codex", "codex");
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
  expect(pending).toEqual([]);
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
it("runs local tasks and approvals without a grant, isolates accounts, and keeps them out of relay replay", async () => {
  const { runtime, task: template, directory, pending } = await host("codex", "codex");
  const accountId = "desktop-user",
    device = await runtime.localDevice(accountId);
  const input = {
    id: crypto.randomUUID(),
    deviceId: device.id,
    projectId: template.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Local work",
  };
  const create = () => runtime.localExecute(accountId, input.id, { method: "tasks.create", input });
  expect((await create()).ok).toBe(true);
  expect((await create()).ok).toBe(true);
  expect(
    await runtime.localExecute(accountId, crypto.randomUUID(), { method: "tasks.create", input }),
  ).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
  await expect.poll(() => runtime.localApprovals(accountId).length).toBe(1);
  const request = runtime.localApprovals(accountId)[0]!;
  expect(pending).toEqual([request.id]);
  expect(runtime.localTasks("another-user", 100)).toEqual([]);
  expect(() => runtime.localTask("another-user", input.id, 0)).toThrow("Task unavailable");
  expect(
    await runtime.localExecute("another-user", crypto.randomUUID(), {
      method: "tasks.cancel",
      input: { id: input.id },
    }),
  ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  expect(
    await runtime.remote("cloud-binding", {
      id: crypto.randomUUID(),
      deviceId: device.id,
      expiresAt: new Date(Date.now() + 15_000).toISOString(),
      request: {
        method: "approvals.decide",
        input: { id: request.id, decision: { type: "allow" } },
      },
    }),
  ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  expect(
    await runtime.localExecute(accountId, crypto.randomUUID(), {
      method: "approvals.decide",
      input: { id: request.id, decision: { type: "allow" } },
    }),
  ).toMatchObject({ ok: true });
  await expect.poll(() => runtime.localTask(accountId, input.id, 0).task.status).toBe("succeeded");
  expect(runtime.localTask(accountId, input.id, 0).task.summary).toBe("Tests passed");
  expect(runtime.localTask(accountId, input.id, 0).events.length).toBeGreaterThan(0);
  expect(runtime.events(`desktop:${accountId}`).events).toEqual([]);
  expect(runtime.replay("cloud-binding", 0).events).toEqual([]);
  const followId = crypto.randomUUID();
  expect(
    await runtime.localExecute(accountId, followId, {
      method: "tasks.followUp",
      input: { id: followId, parentTaskId: input.id, prompt: "Continue locally" },
    }),
  ).toMatchObject({ ok: true });
  await expect.poll(() => runtime.localApprovals(accountId).length).toBe(1);
  expect(
    await runtime.localExecute(accountId, crypto.randomUUID(), {
      method: "tasks.cancel",
      input: { id: followId },
    }),
  ).toMatchObject({ ok: true });
  expect(runtime.localTask(accountId, followId, 0).task.status).toBe("cancelled");
  expect(runtime.localApprovals(accountId)).toEqual([]);
  expect(readFileSync(join(directory, "starts"), "utf8").trim().split("\n")).toHaveLength(2);
  expect(runtime.localClear("another-user")).toEqual({ removed: 0 });
  expect(runtime.localClear(accountId)).toEqual({ removed: 2 });
  expect(runtime.localTasks(accountId, 100)).toEqual([]);
  expect(() => runtime.localTask(accountId, input.id, 0)).toThrow("Task unavailable");
  expect(runtime.localApprovals(accountId)).toEqual([]);
});
it("keeps device-owned work running when an old account binding is detached", async () => {
  const { runtime, task } = await host("codex", "codex");
  const device = await runtime.localDevice(LOCAL_WORKSPACE_ID);
  const input = {
    id: task.id,
    deviceId: device.id,
    projectId: task.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Device-owned work",
  };
  expect(
    (await runtime.localExecute(LOCAL_WORKSPACE_ID, input.id, { method: "tasks.create", input }))
      .ok,
  ).toBe(true);
  await expect.poll(() => runtime.localApprovals(LOCAL_WORKSPACE_ID).length).toBe(1);
  await runtime.localDetach("server:origin:old-account");
  expect(runtime.localTask(LOCAL_WORKSPACE_ID, input.id, 0).task.status).toBe("waiting");
  expect(runtime.localTasks("server:origin:old-account", 100)).toEqual([]);
  expect(runtime.events(`desktop:${LOCAL_WORKSPACE_ID}`).events).toEqual([]);
});
it("keeps current project directories mutually exclusive and cancels waiting children", async () => {
  const { runtime, task } = await host("codex", "codex");
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
    const { runtime, task, directory } = await host("codex", "codex-descendant");
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
  const { runtime, task, directory } = await host("codex", "codex");
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
  const { runtime, task, directory } = await host("claude", "claude-question");
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
  const { runtime, task } = await host("claude", "claude-plan");
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
it("holds headless Claude plans for approval, resumes revisions, and executes only after approval", async () => {
  const { runtime, task, directory } = await host("claude", "claude-headless-plan");
  const binding = "plan-binding";
  await runtime.start(
    binding,
    crypto.randomUUID(),
    { ...task, mode: "plan" },
    new Date(Date.now() + 60_000).toISOString(),
  );
  const plans = () =>
    runtime
      .events(binding)
      .events.filter((event) => event.kind === "request" && event.request.status === "pending");
  await expect.poll(() => plans().length).toBe(1);
  expect(plans()[0]).toMatchObject({
    request: { kind: "plan", body: "Initial implementation plan" },
  });
  expect(
    runtime
      .events(binding)
      .events.some((event) => event.kind === "status" && event.status === "succeeded"),
  ).toBe(false);
  const decide = async (
    index: number,
    decision: { type: "allow" } | { type: "deny"; note: string },
  ) => {
    const event = plans()[index]!;
    if (event.kind !== "request") throw new Error("Missing plan");
    await runtime.command(binding, {
      id: crypto.randomUUID(),
      type: "decision",
      taskId: task.id,
      requestId: event.request.id,
      decision,
    });
  };
  await decide(0, { type: "deny", note: "Revise the plan first" });
  await expect.poll(() => plans().length).toBe(2);
  expect(plans()[1]).toMatchObject({ request: { body: "Revised implementation plan" } });
  const starts = () =>
    readFileSync(join(directory, "starts"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  expect(starts().map((item) => item.mode)).toEqual(["plan", "plan"]);
  expect(starts()[1]).toMatchObject({ resume: "headless-plan-session" });
  expect(starts()[1].prompt).toContain("Revise the plan first");
  await decide(1, { type: "allow" });
  await expect
    .poll(() =>
      runtime
        .events(binding)
        .events.some((event) => event.kind === "status" && event.status === "succeeded"),
    )
    .toBe(true);
  expect(starts().map((item) => item.mode)).toEqual(["plan", "plan", "manual"]);
  expect(starts()[2]).toMatchObject({ resume: "headless-plan-session" });
});
it("does not apply a queued old Claude result to the newly approved execution", async () => {
  const { runtime, task, directory } = await host("claude", "claude-headless-plan");
  writeFileSync(join(directory, "duplicate-plan-result"), "");
  const account = "queued-result",
    device = await runtime.localDevice(account);
  const input = {
    id: task.id,
    deviceId: device.id,
    projectId: task.projectId,
    provider: task.provider,
    mode: "plan" as const,
    prompt: task.prompt,
  };
  await runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await expect.poll(() => runtime.localApprovals(account).length).toBe(1);
  const request = runtime.localApprovals(account)[0]!;
  expect(
    await runtime.localExecute(account, crypto.randomUUID(), {
      method: "approvals.decide",
      input: { id: request.id, decision: { type: "allow" } },
    }),
  ).toMatchObject({ ok: true });
  await expect.poll(() => runtime.localTask(account, input.id, 0).task.status).toBe("succeeded");
  expect(runtime.localTask(account, input.id, 0).task.summary).toBe("Implemented approved plan");
  const starts = readFileSync(join(directory, "starts"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(starts.map((entry) => entry.mode)).toEqual(["plan", "manual"]);
  expect(runtime.localApprovals(account)).toEqual([]);
});
it("keeps a Claude plan pending when the drained old process rejects", async () => {
  const { runtime, task, directory } = await host("claude", "claude-headless-plan");
  writeFileSync(join(directory, "malformed-after-result"), "");
  const account = "old-process",
    device = await runtime.localDevice(account);
  const input = {
    id: task.id,
    deviceId: device.id,
    projectId: task.projectId,
    provider: task.provider,
    mode: "plan" as const,
    prompt: task.prompt,
  };
  await runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await expect.poll(() => runtime.localApprovals(account).length).toBe(1);
  expect(runtime.localTask(account, input.id, 0).task.status).toBe("waiting");
  const approval = runtime.localApprovals(account)[0]!;
  const result = await runtime.localExecute(account, crypto.randomUUID(), {
    method: "approvals.decide",
    input: { id: approval.id, decision: { type: "allow" } },
  });
  expect(result.ok).toBe(true);
  await expect.poll(() => runtime.localTask(account, input.id, 0).task.status).toBe("succeeded");
});
it("cancels a headless Claude plan without spawning an implementation process", async () => {
  const { runtime, task, directory } = await host("claude", "claude-headless-plan");
  await runtime.start(
    "binding",
    crypto.randomUUID(),
    { ...task, mode: "plan" },
    new Date(Date.now() + 60_000).toISOString(),
  );
  await expect
    .poll(() => runtime.events("binding").events.some((event) => event.kind === "request"))
    .toBe(true);
  await runtime.detach("binding");
  expect(readFileSync(join(directory, "starts"), "utf8").trim().split("\n")).toHaveLength(1);
  expect(runtime.events("binding").events.at(-1)).toMatchObject({
    kind: "status",
    status: "cancelled",
  });
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
  const { runtime, task, directory } = await host("codex", "codex");
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
  const { runtime, task } = await host("codex", "codex");
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
  const { runtime, task, directory } = await host("codex", "codex");
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
