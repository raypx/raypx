import { expect, it } from "vite-plus/test";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentFixtures } from "../../../helpers/agents";

import {
  taskExecutionPrompt,
  type AgentProvider,
  type TaskContextSnapshot,
} from "@raypx/core/tasks";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { AgentStore } from "../../../../src/runtime/agents/store";
const { host } = agentFixtures();

function contextSnapshot(scope: "device" | "account" = "device"): TaskContextSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    sources: [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: "memory",
        name: "Selected conventions",
        content: "Pinned reference content",
        scope,
        project: null,
      },
    ],
  };
}
async function completedContextParent(provider: AgentProvider, context = contextSnapshot()) {
  const f = await host(provider, `${provider}-interactive`, async () => context);
  const device = await f.runtime.localDevice(LOCAL_WORKSPACE_ID);
  const input = {
    id: f.task.id,
    deviceId: device.id,
    projectId: f.task.projectId,
    provider,
    mode: "run" as const,
    prompt: "Initial task",
    contextSelection: { sources: context.sources.map(({ id, revision }) => ({ id, revision })) },
  };
  expect(
    await f.runtime.localExecute(LOCAL_WORKSPACE_ID, input.id, { method: "tasks.create", input }),
  ).toMatchObject({ ok: true });
  await expect.poll(() => existsSync(join(f.directory, "delivered"))).toBe(true);
  writeFileSync(join(f.directory, "complete"), "");
  await expect
    .poll(() => f.runtime.localTask(LOCAL_WORKSPACE_ID, input.id, 0).task.status)
    .toBe("succeeded");
  return { ...f, input, context };
}
it.each(["claude", "codex"] as const)(
  "injects frozen context once for %s and resumes long follow-ups without reinjection",
  async (provider) => {
    const context = contextSnapshot();
    context.sources = Array.from({ length: 4 }, () => ({
      ...context.sources[0]!,
      id: crypto.randomUUID(),
      content: "Pinned reference content" + "x".repeat(7470),
    }));
    let resolutions = 0;
    const f = await host(provider, `${provider}-interactive`, async () => {
      if (resolutions++) throw new Error("Source was archived after delivery");
      return context;
    });
    const device = await f.runtime.localDevice(LOCAL_WORKSPACE_ID);
    const input = {
      id: f.task.id,
      deviceId: device.id,
      projectId: f.task.projectId,
      provider,
      mode: "run" as const,
      prompt: "Original task",
      contextSelection: { sources: context.sources.map(({ id, revision }) => ({ id, revision })) },
    };
    const request = { method: "tasks.create" as const, input };
    expect(await f.runtime.localExecute(LOCAL_WORKSPACE_ID, input.id, request)).toMatchObject({
      ok: true,
      value: { context },
    });
    await expect.poll(() => existsSync(join(f.directory, "delivered"))).toBe(true);
    expect(readFileSync(join(f.directory, "delivered"), "utf8")).toContain(
      "Pinned reference content",
    );
    expect(f.runtime.localTask(LOCAL_WORKSPACE_ID, input.id, 0).task).not.toHaveProperty(
      "contextSelection",
    );
    expect(await f.runtime.localExecute(LOCAL_WORKSPACE_ID, input.id, request)).toMatchObject({
      ok: true,
      value: { context },
    });
    expect(resolutions).toBe(1);
    writeFileSync(join(f.directory, "complete"), "");
    await expect
      .poll(() => f.runtime.localTask(LOCAL_WORKSPACE_ID, input.id, 0).task.status)
      .toBe("succeeded");
    const next = crypto.randomUUID();
    const nextPrompt = "Follow-up task " + "n".repeat(4000);
    expect(() => taskExecutionPrompt({ prompt: nextPrompt, context })).toThrow("CONTEXT_TOO_LARGE");
    expect(
      await f.runtime.localExecute(LOCAL_WORKSPACE_ID, next, {
        method: "tasks.followUp",
        input: { id: next, parentTaskId: input.id, prompt: nextPrompt },
      }),
    ).toMatchObject({ ok: true, value: { context } });
    await expect
      .poll(() => readFileSync(join(f.directory, "delivered"), "utf8").includes("Follow-up task"))
      .toBe(true);
    const lines = readFileSync(join(f.directory, "delivered"), "utf8").trim().split("\n");
    expect(lines.at(-1)).not.toContain("Pinned reference content");
    expect(lines.at(-1)).toContain(nextPrompt);
    const sessions = readFileSync(join(f.directory, "sessions"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(sessions.at(-1)).toMatchObject(
      provider === "codex"
        ? { method: "thread/resume", params: { threadId: "interactive" } }
        : { resume: "interactive" },
    );
    expect(resolutions).toBe(1);
  },
);

it.each(["claude", "codex"] as const)(
  "fails a rejected %s resume without a new session or inference",
  async (provider) => {
    const f = await completedContextParent(provider),
      id = crypto.randomUUID();
    writeFileSync(join(f.directory, "resume-failed"), "");
    expect(
      await f.runtime.localExecute(LOCAL_WORKSPACE_ID, id, {
        method: "tasks.followUp",
        input: { id, parentTaskId: f.input.id, prompt: "Continue" },
      }),
    ).toMatchObject({ ok: true, value: { context: f.context } });
    await expect
      .poll(() => f.runtime.localTask(LOCAL_WORKSPACE_ID, id, 0).task.status)
      .toBe("failed");
    expect(readFileSync(join(f.directory, "delivered"), "utf8").trim().split("\n")).toHaveLength(1);
    const sessions = readFileSync(join(f.directory, "sessions"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(sessions).toHaveLength(2);
    expect(sessions.at(-1)).toMatchObject(
      provider === "codex" ? { method: "thread/resume" } : { resume: "interactive" },
    );
  },
);

it.each(["claude", "codex"] as const)(
  "does not treat a %s parent id without a saved session as a resume",
  async (provider) => {
    const f = await completedContextParent(provider),
      id = crypto.randomUUID();
    const store = new AgentStore(f.directory);
    try {
      const parent = store.get(f.input.id)!;
      store.put({ ...parent, sessionId: null });
    } finally {
      store.close();
    }
    expect(
      await f.runtime.localExecute(LOCAL_WORKSPACE_ID, id, {
        method: "tasks.followUp",
        input: { id, parentTaskId: f.input.id, prompt: "Continue" },
      }),
    ).toMatchObject({ ok: true });
    await expect
      .poll(() => f.runtime.localTask(LOCAL_WORKSPACE_ID, id, 0).task.status)
      .toBe("failed");
    expect(f.runtime.localTask(LOCAL_WORKSPACE_ID, id, 0).task).toMatchObject({
      summary: "SESSION_UNAVAILABLE",
      context: f.context,
    });
    expect(readFileSync(join(f.directory, "sessions"), "utf8").trim().split("\n")).toHaveLength(1);
    expect(readFileSync(join(f.directory, "delivered"), "utf8").trim().split("\n")).toHaveLength(1);
  },
);

it.each(["claude", "codex"] as const)(
  "fails a %s resume that returns a different session without silently replacing history",
  async (provider) => {
    const f = await completedContextParent(provider),
      id = crypto.randomUUID();
    writeFileSync(join(f.directory, "resume-new-session"), "");
    expect(
      await f.runtime.localExecute(LOCAL_WORKSPACE_ID, id, {
        method: "tasks.followUp",
        input: { id, parentTaskId: f.input.id, prompt: "Continue the same conversation" },
      }),
    ).toMatchObject({ ok: true, value: { context: f.context } });
    await expect
      .poll(() => f.runtime.localTask(LOCAL_WORKSPACE_ID, id, 0).task.status)
      .toBe("failed");
    expect(f.runtime.localTask(LOCAL_WORKSPACE_ID, id, 0).task).toMatchObject({
      summary: "SESSION_UNAVAILABLE",
      context: f.context,
    });
    const store = new AgentStore(f.directory);
    try {
      expect(store.get(id)?.sessionId).not.toBe("fresh-interactive");
    } finally {
      store.close();
    }
  },
);

it("rejects a substituted Codex session before user input even when parent context exceeds the follow-up budget", async () => {
  const context = contextSnapshot();
  context.sources = Array.from({ length: 4 }, () => ({
    ...context.sources[0]!,
    id: crypto.randomUUID(),
    content: "x".repeat(7500),
  }));
  const f = await completedContextParent("codex", context),
    id = crypto.randomUUID();
  writeFileSync(join(f.directory, "resume-new-session"), "");
  expect(
    await f.runtime.localExecute(LOCAL_WORKSPACE_ID, id, {
      method: "tasks.followUp",
      input: { id, parentTaskId: f.input.id, prompt: "n".repeat(4000) },
    }),
  ).toMatchObject({ ok: true });
  await expect
    .poll(() => f.runtime.localTask(LOCAL_WORKSPACE_ID, id, 0).task.status)
    .toBe("failed");
  expect(f.runtime.localTask(LOCAL_WORKSPACE_ID, id, 0).task).toMatchObject({
    summary: "SESSION_UNAVAILABLE",
    context,
  });
  expect(readFileSync(join(f.directory, "delivered"), "utf8").trim().split("\n")).toHaveLength(1);
});

it("uses only the authoritative remote snapshot and rejects excess context before launching", async () => {
  const f = await host("codex", "codex-interactive", async () => {
    throw new Error("Device memory must not be consulted");
  });
  const context = contextSnapshot("account"),
    taskId = crypto.randomUUID();
  const input = {
    id: taskId,
    deviceId: f.task.deviceId,
    projectId: f.task.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Remote task",
    contextSelection: { sources: context.sources.map(({ id, revision }) => ({ id, revision })) },
  };
  expect(
    await f.runtime.remote("remote-binding", {
      id: taskId,
      deviceId: input.deviceId,
      expiresAt: new Date(Date.now() + 15000).toISOString(),
      request: { method: "tasks.create", input },
      context,
    }),
  ).toMatchObject({ ok: true, value: { context } });
  await expect.poll(() => existsSync(join(f.directory, "delivered"))).toBe(true);
  await f.runtime.detach("remote-binding");
  const oversized = contextSnapshot("account");
  oversized.sources = Array.from({ length: 5 }, () => ({
    ...oversized.sources[0]!,
    id: crypto.randomUUID(),
    content: "x".repeat(8000),
  }));
  const next = crypto.randomUUID();
  expect(
    await f.runtime.remote("remote-binding", {
      id: next,
      deviceId: input.deviceId,
      expiresAt: new Date(Date.now() + 15000).toISOString(),
      request: { method: "tasks.create", input: { ...input, id: next } },
      context: oversized,
    }),
  ).toMatchObject({ ok: false, code: "CONTEXT_TOO_LARGE" });
  expect(readFileSync(join(f.directory, "delivered"), "utf8").trim().split("\n")).toHaveLength(1);
});
