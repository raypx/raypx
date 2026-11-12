import { AgentStore } from "../../../../src/runtime/agents/store.js";
import { SqlitePiContextStore } from "../../../../src/runtime/agents/harness/context/sqlite.js";
import { AgentRuntime } from "../../../../src/runtime/agents/index.js";
import { expect, it, afterEach, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { runtimeFixtures } from "../../../helpers/runtime.js";
import { aiFixture } from "../../../helpers/ai.js";
const { fixture } = runtimeFixtures();
const servers: ReturnType<typeof aiFixture>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  vi.unstubAllEnvs();
});

it("runs Pi through the task owner, persists model/context, and resumes only the current revision", async () => {
  const f = await fixture();
  vi.stubEnv("RAYPX_HOME", f.dir);
  const server = aiFixture();
  servers.push(server);
  await writeFile(
    join(f.dir, "config.toml"),
    `[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = "${server.url}"\n`,
  );
  await f.runtime.request("agents.configure", { rootId: f.grant.id, providers: ["pi"] });
  const device = await f.runtime.agents.localDevice(LOCAL_WORKSPACE_ID);
  expect(device.capabilities.find((entry) => entry.provider === "pi")).toMatchObject({
    available: true,
    inputModes: ["queue"],
  });
  const memory = (await f.runtime.request("memory.create", {
    requestId: crypto.randomUUID(),
    document: {
      kind: "memory",
      name: "Pi conventions",
      category: "Project",
      content: "Pinned Pi reference",
      project: null,
    },
  })) as { id: string; revision: number };
  const id = crypto.randomUUID();
  expect(
    await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, id, {
      method: "tasks.create",
      input: {
        id,
        deviceId: device.id,
        projectId: f.grant.id,
        provider: "pi",
        mode: "run",
        prompt: "Synthetic task",
        contextSelection: { sources: [{ id: memory.id, revision: memory.revision }] },
      },
    }),
  ).toMatchObject({ ok: true });
  await expect
    .poll(() => f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0).task)
    .toMatchObject({ status: "succeeded", summary: "PI_AI_READY" });
  const detail = f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0);
  expect(detail.task.model).toMatchObject({ provider: "local", model: "fixture-model" });
  expect(detail.piContinuation).toMatchObject({ blocked: false });
  const next = crypto.randomUUID();
  expect(
    await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, next, {
      method: "tasks.followUp",
      input: {
        id: next,
        parentTaskId: id,
        prompt: "Continue",
        contextRevision: detail.piContinuation!.revision,
      },
    }),
  ).toMatchObject({ ok: true });
  await expect
    .poll(() => f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, next, 0).task)
    .toMatchObject({ status: "succeeded", summary: "PI_AI_READY" });
  expect(f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0).piContinuation?.blocked).toBe(true);
  expect(server.requests).toHaveLength(2);
  expect(JSON.stringify(server.requests[0]?.body)).toContain("Pinned Pi reference");
  expect(JSON.stringify(server.requests[1]?.body).split("Pinned Pi reference")).toHaveLength(2);
  await expect(
    f.runtime.agents.start(
      "remote-binding",
      crypto.randomUUID(),
      detail.task,
      new Date(Date.now() + 10_000).toISOString(),
    ),
  ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
});

it("stores device model defaults without rewriting TOML or exposing a credential", async () => {
  const f = await fixture();
  vi.stubEnv("RAYPX_HOME", f.dir);
  const server = aiFixture();
  servers.push(server);
  const source = `[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = "${server.url}"\n`;
  await writeFile(join(f.dir, "config.toml"), source);
  const catalog = (await f.runtime.request("agents.models.list", {})) as {
    models: { selection: { provider: string; model: string; connectionId: string } }[];
    default: unknown;
  };
  const model = catalog.models.find((entry) => entry.selection.provider === "local")!.selection;
  expect(await f.runtime.request("agents.models.setDefault", { model })).toEqual({
    default: model,
  });
  expect(await f.runtime.request("agents.models.default", {})).toEqual({ default: model });
  expect(server.requests).toHaveLength(0);
});

it("executes project writes and commands only after separately applied approvals", async () => {
  const f = await fixture();
  vi.stubEnv("RAYPX_HOME", f.dir);
  const server = aiFixture({
    toolSequence: [
      {
        name: "files_write",
        arguments: { path: "output.txt", text: "Approved content", version: null },
      },
      {
        name: "command_run",
        arguments: {
          executable: process.execPath,
          args: ["-e", "await Bun.sleep(500); process.stdout.write('done')"],
          cwd: "",
          timeoutMs: 1000,
        },
      },
      null,
    ],
  });
  servers.push(server);
  await writeFile(
    join(f.dir, "config.toml"),
    `[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = "${server.url}"\n`,
  );
  f.runtime.agents.configure(f.grant.id, ["pi"]);
  const device = await f.runtime.agents.localDevice(LOCAL_WORKSPACE_ID),
    id = crypto.randomUUID();
  await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, id, {
    method: "tasks.create",
    input: {
      id,
      deviceId: device.id,
      projectId: f.grant.id,
      provider: "pi",
      mode: "run",
      prompt: "Synthetic coding task",
    },
  });
  const approve = async (title: string) => {
    await expect
      .poll(() =>
        f.runtime.agents
          .localApprovals(LOCAL_WORKSPACE_ID)
          .some((request) => request.title === title),
      )
      .toBe(true);
    const request = f.runtime.agents
      .localApprovals(LOCAL_WORKSPACE_ID)
      .find((entry) => entry.title === title)!;
    expect(
      await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, crypto.randomUUID(), {
        method: "approvals.decide",
        input: { id: request.id, decision: { type: "allow" } },
      }),
    ).toMatchObject({ ok: true, value: { status: "applied" } });
  };
  await expect.poll(() => f.runtime.agents.localApprovals(LOCAL_WORKSPACE_ID).length).toBe(1);
  await expect(f.runtime.files.read(f.grant.id, "output.txt")).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(server.requests).toHaveLength(1);
  await approve("files_write");
  await approve("command_run");
  await expect
    .poll(() => f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0).piContinuation)
    .toMatchObject({
      blocked: false,
      pendingEffect: { name: "command_run" },
    });
  await expect
    .poll(() => f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0).task)
    .toMatchObject({ status: "succeeded", summary: "PI_AI_READY" });
  expect((await f.runtime.files.read(f.grant.id, "output.txt")).text).toBe("Approved content");
  expect(server.requests).toHaveLength(3);
  expect(f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0).piContinuation?.blocked).toBe(false);
});

it("requires revision-bound consent before sending conversation history to a changed connection", async () => {
  const f = await fixture();
  vi.stubEnv("RAYPX_HOME", f.dir);
  const first = aiFixture(),
    target = aiFixture({ api: "anthropic-messages" });
  servers.push(first, target);
  const settings = async (url: string, api: string) =>
    writeFile(
      join(f.dir, "config.toml"),
      `[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "${api}"\nbase_url = "${url}"\n`,
    );
  await settings(first.url, "openai-completions");
  f.runtime.agents.configure(f.grant.id, ["pi"]);
  const device = await f.runtime.agents.localDevice(LOCAL_WORKSPACE_ID),
    id = crypto.randomUUID();
  await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, id, {
    method: "tasks.create",
    input: {
      id,
      deviceId: device.id,
      projectId: f.grant.id,
      provider: "pi",
      mode: "run",
      prompt: "Synthetic context",
    },
  });
  await expect
    .poll(() => f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0).task.status)
    .toBe("succeeded");
  const detail = f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0);
  await settings(new URL(target.url).origin, "anthropic-messages");
  const catalog = (await f.runtime.request(
    "agents.models.list",
    {},
  )) as import("@raypx/core/tasks").ModelCatalog;
  const model = catalog.models.find((entry) => entry.provider === "local")!.selection;
  const input = {
    id: crypto.randomUUID(),
    parentTaskId: id,
    prompt: "Continue",
    model,
    contextRevision: detail.piContinuation!.revision,
  };
  await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, input.id, {
    method: "tasks.followUp",
    input,
  });
  expect(f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, input.id, 0).task.summary).toBe(
    "PI_CONTEXT_TRANSFER_REQUIRED",
  );
  expect(target.requests).toHaveLength(0);
  const confirmed = {
    ...input,
    id: crypto.randomUUID(),
    contextTransfer: { revision: input.contextRevision, connectionId: model.connectionId },
  };
  await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, confirmed.id, {
    method: "tasks.followUp",
    input: confirmed,
  });
  await expect
    .poll(() => f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, confirmed.id, 0).task)
    .toMatchObject({ status: "succeeded", summary: "PI_AI_READY" });
  expect(JSON.stringify(target.requests[0]?.body)).toContain("Synthetic context");
  expect(target.requests[0]).toMatchObject({ authorization: null, apiKey: null });
});

it("cancels an admitted Pi task before creating its session when cancellation arrives during preparation", async () => {
  const f = await fixture();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const preparing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const factory = vi.fn(() => {
    throw new Error("Cancelled session must not be constructed");
  });
  const dispose = vi.fn();
  const host = new AgentRuntime(f.runtime.state, () => {}, {
    pi: {
      available: async () => true,
      inspect: () => undefined,
      prepare: async () => {
        entered();
        await gate;
        return { factory, dispose };
      },
    },
  });
  try {
    host.configure(f.grant.id, ["pi"]);
    const device = await host.localDevice(LOCAL_WORKSPACE_ID),
      id = crypto.randomUUID();
    const starting = host.localExecute(LOCAL_WORKSPACE_ID, id, {
      method: "tasks.create",
      input: {
        id,
        deviceId: device.id,
        projectId: f.grant.id,
        provider: "pi",
        mode: "run",
        prompt: "Synthetic cancelled admission",
      },
    });
    await preparing;
    const cancelling = host.localExecute(LOCAL_WORKSPACE_ID, crypto.randomUUID(), {
      method: "tasks.cancel",
      input: { id },
    });
    await Promise.resolve();
    release();
    await starting;
    await cancelling;
    expect(host.localTask(LOCAL_WORKSPACE_ID, id, 0).task.status).toBe("cancelled");
    expect(factory).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await host.close();
  }
});

it("rejects continuation of an allocated Pi context that never received its first prompt", async () => {
  const f = await fixture();
  vi.stubEnv("RAYPX_HOME", f.dir);
  const server = aiFixture();
  servers.push(server);
  await writeFile(
    join(f.dir, "config.toml"),
    `[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = "${server.url}"\n`,
  );
  f.runtime.agents.configure(f.grant.id, ["pi"]);
  const device = await f.runtime.agents.localDevice(LOCAL_WORKSPACE_ID);
  const catalog = (await f.runtime.request(
    "agents.models.list",
    {},
  )) as import("@raypx/core/tasks").ModelCatalog;
  const model = catalog.models.find((entry) => entry.provider === "local")!.selection;
  const id = crypto.randomUUID(),
    binding = "desktop:" + LOCAL_WORKSPACE_ID,
    sessionId = "pi:v1:" + crypto.randomUUID();
  const task: import("@raypx/core/tasks").AgentTask = {
    id,
    deviceId: device.id,
    projectId: f.grant.id,
    provider: "pi",
    mode: "run",
    model,
    prompt: "Never delivered",
    status: "cancelled",
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  new AgentStore(f.runtime.state.db).accept({ task, binding, sessionId }, id);
  const context = new SqlitePiContextStore(f.runtime.state.db, sessionId);
  await context.commit(0, {
    status: "idle",
    messages: [],
    identity: { version: 1, binding, projectId: task.projectId, ownerTaskId: id, model },
  });
  context.close();
  const detail = f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, id, 0);
  expect(detail.piContinuation?.blocked).toBe(true);
  const next = crypto.randomUUID();
  await f.runtime.agents.localExecute(LOCAL_WORKSPACE_ID, next, {
    method: "tasks.followUp",
    input: {
      id: next,
      parentTaskId: id,
      prompt: "Continue",
      contextRevision: detail.piContinuation!.revision,
    },
  });
  expect(f.runtime.agents.localTask(LOCAL_WORKSPACE_ID, next, 0).task.summary).toBe(
    "SESSION_UNAVAILABLE",
  );
  expect(server.requests).toHaveLength(0);
});
