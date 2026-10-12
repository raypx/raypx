import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCloudApplication } from "@voidmix/application";
import { InMemoryCloudRepository } from "@voidmix/db";
import { createMemoryStorage } from "@voidmix/storage";
import { defaultCloudLimits } from "@voidmix/core";
import type { CloudPiAgent, CloudPiRunInput } from "@voidmix/ai";
import { createCloudDispatcher, createCloudExecutor, runCloudExecutions } from "./cloud.js";

async function fixture(mode: "computer" | "search" = "search", calls = 40) {
  const repository = new InMemoryCloudRepository({
    users: [{ id: "owner", email: "owner@example.com" }],
  });
  const limits = { ...defaultCloudLimits, taskCalls: calls };
  const app = createCloudApplication({ repository, limits });
  const conversation = await app.createConversation({
    actorId: "owner",
    title: "Cloud",
    idempotencyKey: crypto.randomUUID(),
  });
  const turn = await app.sendTurn({
    actorId: "owner",
    conversationId: conversation.id,
    prompt: "Analyze a table",
    mode,
    idempotencyKey: crypto.randomUUID(),
  });
  return {
    repository,
    app,
    limits,
    run: turn.run,
    task: turn.task,
    storage: createMemoryStorage(),
  };
}
async function modelCall(input: CloudPiRunInput) {
  const callId = crypto.randomUUID();
  await input.hooks.reserve({
    callId,
    provider: "test",
    model: "fixture",
    maxTokens: 100,
    pricing: { inputPerMillion: 1, outputPerMillion: 2 },
  });
  await input.hooks.start(callId);
  await input.hooks.settle({
    callId,
    started: true,
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
  });
}
const mailer = () => ({
  sendVerification: vi.fn(async () => {}),
  sendPasswordReset: vi.fn(async () => {}),
  sendWelcome: vi.fn(async () => {}),
  sendTaskNotification: vi.fn(async () => {}),
});
afterEach(() => vi.restoreAllMocks());
describe("durable cloud execution", () => {
  it("keeps successive assistant messages distinct and streams the next message after completion", async () => {
    const state = await fixture("computer");
    await state.app.acceptQueued({ runId: state.run.id });
    const agent: CloudPiAgent = {
      run: async (input) => {
        await input.onEvent({ type: "text_delta", text: "First" });
        await input.onEvent({ type: "message_completed", text: "First", stopReason: "toolUse" });
        await input.onEvent({ type: "text_delta", text: "Second" });
        const live = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
        expect(
          [...live.messages]
            .sort((a, b) => a.sequence - b.sequence)
            .map((message) => [message.text, message.completed]),
        ).toEqual([
          ["First", true],
          ["Second", false],
        ]);
        await input.onEvent({ type: "message_completed", text: "Second", stopReason: "stop" });
        return { type: "completed", text: "Second" };
      },
    };
    await createCloudExecutor({ ...state, agent })(state.run.id);
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(snapshot.run.status).toBe("needs_input");
    expect(new Set(snapshot.messages.map((message) => message.id)).size).toBe(2);
  });
  it("aborts and drains active executions before surfacing a queue query failure", async () => {
    const state = await fixture();
    let stopped = false;
    vi.spyOn(state.app, "listReadyRuns")
      .mockResolvedValueOnce([state.run])
      .mockRejectedValue(new Error("Database unavailable"));
    await expect(
      runCloudExecutions(
        {
          app: state.app,
          pollMs: 1,
          execute: async (_runId, signal) => {
            await new Promise<void>((resolve) => {
              signal!.addEventListener(
                "abort",
                () => {
                  stopped = true;
                  resolve();
                },
                { once: true },
              );
            });
          },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow("Database unavailable");
    expect(stopped).toBe(true);
  });
  it("accepts durable intent before starting and duplicate deliveries execute once", async () => {
    const state = await fixture();
    const fullWorkerHistory = vi
      .spyOn(state.app, "workerSnapshot")
      .mockRejectedValue(new Error("The control path must not load full event history."));
    const dispatch = createCloudDispatcher({
      app: state.app,
      mailer: mailer(),
      webUrl: "https://voidmix.example",
    });
    const item = { id: "event", type: "cloud.run.queued", payload: { runId: state.run.id } };
    await dispatch(item);
    await dispatch(item);
    const accepted = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(accepted.run.status).toBe("queued");
    expect(accepted.run.dispatchReady).toBe(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              { url: "https://example.com/research", title: "Verified", description: "Evidence" },
            ],
          },
        }),
      ),
    );
    const run = vi.fn(async (input: CloudPiRunInput) => {
      await modelCall(input);
      await input.tools
        .find((tool) => tool.name === "search")!
        .execute({ query: "Evidence" }, { callId: "search", signal: input.signal });
      await input.onEvent({ type: "text_delta", text: "Answer" });
      await input.onEvent({ type: "message_completed", text: "Answer", stopReason: "stop" });
      return { type: "completed" as const, text: "Answer [source](https://example.com/research)" };
    });
    const execute = createCloudExecutor({ ...state, agent: { run }, searchApiKey: "test-fixture" });
    await Promise.all([execute(state.run.id), execute(state.run.id)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(fullWorkerHistory).not.toHaveBeenCalled();
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(snapshot.run.status).toBe("succeeded");
    expect(snapshot.events.map((event) => event.sequence)).toEqual(
      snapshot.events.map((_, index) => index + 1),
    );
    expect((await state.app.getUsage({ actorId: "owner" })).calls).toBe(1);
    await expect(
      dispatch({ id: "legacy", type: "agent.run.queued", payload: { runId: state.run.id } }),
    ).rejects.toThrow("Unsupported");
  });
  it("propagates cancellation before completion and retains real consumed usage", async () => {
    const state = await fixture();
    await state.app.acceptQueued({ runId: state.run.id });
    const agent: CloudPiAgent = {
      async run(input) {
        await modelCall(input);
        await state.app.createCommand({
          actorId: "owner",
          runId: state.run.id,
          type: "cancel",
          idempotencyKey: "cancel",
        });
        return { type: "completed", text: "Late result" };
      },
    };
    await createCloudExecutor({ ...state, agent })(state.run.id);
    expect(
      (await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id })).run.status,
    ).toBe("cancelled");
    expect((await state.app.getUsage({ actorId: "owner" })).calls).toBe(1);
  });
  it("uses interrupted failure for host shutdown, then retries with a new Run", async () => {
    const state = await fixture();
    await state.app.acceptQueued({ runId: state.run.id });
    const controller = new AbortController();
    const agent: CloudPiAgent = {
      async run(input) {
        await modelCall(input);
        controller.abort();
        return { type: "cancelled" };
      },
    };
    await createCloudExecutor({ ...state, agent })(state.run.id, controller.signal);
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(snapshot.run).toMatchObject({ status: "failed", error: "interrupted" });
    const retry = await state.app.retryRun({
      actorId: "owner",
      runId: state.run.id,
      idempotencyKey: "retry",
    });
    expect(retry.id).not.toBe(state.run.id);
    expect(retry.attempt).toBe(2);
  });
  it("delegates two children with one shared durable task budget", async () => {
    const state = await fixture("computer", 2);
    await state.app.acceptQueued({ runId: state.run.id });
    let children = 0;
    const agent: CloudPiAgent = {
      async run(input) {
        await modelCall(input);
        const delegate = input.tools.find((tool) => tool.name === "delegate");
        if (delegate)
          await delegate.execute(
            {
              tasks: [
                { role: "research", prompt: "One" },
                { role: "research", prompt: "Two" },
              ],
            },
            { callId: "delegate", signal: input.signal },
          );
        else children++;
        return { type: "completed", text: "Done" };
      },
    };
    await createCloudExecutor({ ...state, agent })(state.run.id);
    expect(
      (await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id })).run.status,
    ).toBe("failed");
    expect((await state.app.getUsage({ actorId: "owner" })).calls).toBe(2);
    expect(children).toBe(1);
  });
  it("publishes actual XLSX/CSV/PDF/Markdown as one revision and waits for user acceptance", async () => {
    const state = await fixture("computer");
    const data = new TextEncoder().encode("Category,Value\nA,10\nB,20\n");
    const checksum = createHash("sha256").update(data).digest("hex");
    const asset = await state.app.createUpload({
      actorId: "owner",
      name: "data.csv",
      mediaType: "text/csv",
      byteSize: data.byteLength,
      checksum,
      idempotencyKey: "input",
    });
    await state.storage.put({
      key: asset.objectKey,
      body: data,
      contentType: asset.mediaType,
      checksumSha256: checksum,
    });
    await state.app.completeUpload({
      actorId: "owner",
      assetVersionId: asset.id,
      byteSize: data.byteLength,
      checksum,
      idempotencyKey: "complete",
    });
    // Use a new task with an attachment, preserving the first queued task independently.
    const conversation = await state.app.createConversation({
      actorId: "owner",
      title: "Data",
      idempotencyKey: "data-conversation",
    });
    const turn = await state.app.sendTurn({
      actorId: "owner",
      conversationId: conversation.id,
      prompt: "Create report and workbook",
      mode: "computer",
      attachmentIds: [asset.id],
      idempotencyKey: "data-turn",
    });
    await state.app.acceptQueued({ runId: turn.run.id });
    const agent: CloudPiAgent = {
      async run(input) {
        await modelCall(input);
        const invoke = async (name: string, args: unknown) =>
          input.tools
            .find((tool) => tool.name === name)!
            .execute(args, { callId: crypto.randomUUID(), signal: input.signal });
        const extracted = (await invoke("extract_file", { assetVersionId: asset.id })) as {
          tables: { tableId: string }[];
        };
        const computed = (await invoke("compute_table", {
          tableId: extracted.tables[0]!.tableId,
          operation: "summary",
          column: "Value",
        })) as { tableId: string };
        await invoke("render_table", { title: "Analysis", tableIds: [computed.tableId] });
        await invoke("render_report", {
          title: "Analysis",
          sections: [{ heading: "Results", body: "The trusted table sum is 30." }],
        });
        return { type: "completed", text: "Four verified files are ready." };
      },
    };
    await createCloudExecutor({ ...state, agent })(turn.run.id);
    const task = await state.app.getTask({ actorId: "owner", taskId: turn.task!.id });
    expect(task.task.status).toBe("review");
    expect(task.revisions).toHaveLength(1);
    expect(task.revisions[0]!.assetVersionIds).toHaveLength(4);
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: turn.run.id });
    expect(snapshot.artifacts.map((a) => a.mediaType)).toContain("application/pdf");
    expect(snapshot.run.status).toBe("succeeded");
    const accepted = await state.app.acceptRevision({
      actorId: "owner",
      taskId: turn.task!.id,
      revisionId: task.revisions[0]!.id,
      roundId: task.revisions[0]!.roundId,
      goalVersion: task.revisions[0]!.goalVersion,
      idempotencyKey: "accept",
    });
    expect(accepted.status).toBe("completed");
  }, 15_000);
  it("delivers only opted-in, authorized notifications and marks successful delivery", async () => {
    const state = await fixture("computer");
    await state.app.updatePreferences({
      actorId: "owner",
      emailEnabled: true,
      locale: "zh",
      idempotencyKey: "prefs",
    });
    await state.app.acceptQueued({ runId: state.run.id });
    await createCloudExecutor({
      ...state,
      agent: {
        async run() {
          return { type: "completed", text: "Please provide the missing data." };
        },
      },
    })(state.run.id);
    const notification = (await state.app.listNotifications({ actorId: "owner" })).items[0]!;
    const transport = mailer();
    const dispatch = createCloudDispatcher({
      app: state.app,
      mailer: transport,
      webUrl: "https://voidmix.example",
    });
    await dispatch({
      id: "notify",
      type: "cloud.notification.created",
      payload: { notificationId: notification.id },
    });
    await dispatch({
      id: "duplicate",
      type: "cloud.notification.created",
      payload: { notificationId: notification.id },
    });
    expect(transport.sendTaskNotification).toHaveBeenCalledTimes(1);
    expect(transport.sendTaskNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        locale: "zh",
        kind: "waiting_input",
        idempotencyKey: `notification:${notification.id}:owner`,
      }),
    );
  });
  it("does not expose a partial delivery when the second object upload fails", async () => {
    const state = await fixture("computer");
    await state.app.acceptQueued({ runId: state.run.id });
    let uploads = 0;
    const original = state.storage.put.bind(state.storage);
    state.storage.put = async (input) => {
      if (++uploads === 2) throw new Error("Object store unavailable.");
      return original(input);
    };
    const agent: CloudPiAgent = {
      async run(input) {
        await input.tools
          .find((tool) => tool.name === "render_report")!
          .execute(
            { title: "Report", sections: [{ heading: "Verified", body: "Content" }] },
            { callId: "report", signal: input.signal },
          );
        return { type: "completed", text: "Ready" };
      },
    };
    await createCloudExecutor({ ...state, agent })(state.run.id);
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(snapshot.run.status).toBe("failed");
    expect(snapshot.artifacts).toEqual([]);
    expect((await state.app.listAssets({ actorId: "owner" })).items).toEqual([]);
    expect(
      (await state.app.getTask({ actorId: "owner", taskId: state.task!.id })).revisions,
    ).toEqual([]);
  });
  it("does not mark a Search answer successful without real cited evidence", async () => {
    const state = await fixture();
    await state.app.acceptQueued({ runId: state.run.id });
    await createCloudExecutor({
      ...state,
      agent: {
        async run() {
          return { type: "completed", text: "A fabricated research answer." };
        },
      },
    })(state.run.id);
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(snapshot.run.status).toBe("failed");
    expect(snapshot.run.error).toBe("SOURCE_EVIDENCE_INVALID");
  });
  it("links a failed Search notification to its conversation without requiring a Task", async () => {
    const state = await fixture();
    await state.app.updatePreferences({
      actorId: "owner",
      emailEnabled: true,
      locale: "en",
      idempotencyKey: "mail-prefs",
    });
    await state.app.acceptQueued({ runId: state.run.id });
    await createCloudExecutor({
      ...state,
      agent: {
        async run() {
          return { type: "completed", text: "Unsupported answer" };
        },
      },
    })(state.run.id);
    const notification = (await state.app.listNotifications({ actorId: "owner" })).items[0]!;
    expect(notification).toMatchObject({
      taskId: null,
      conversationId: state.run.conversationId,
      type: "run.failed",
    });
    const transport = mailer();
    await createCloudDispatcher({
      app: state.app,
      mailer: transport,
      webUrl: "https://voidmix.example",
    })({
      id: "search-mail",
      type: "cloud.notification.created",
      payload: { notificationId: notification.id },
    });
    expect(transport.sendTaskNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "run_failed",
        taskId: state.run.conversationId,
        taskUrl: `https://voidmix.example/chat/${state.run.conversationId}`,
      }),
    );
  });
  it("stores only a stable public error code when a provider exception contains private data", async () => {
    const state = await fixture();
    await state.app.acceptQueued({ runId: state.run.id });
    await createCloudExecutor({
      ...state,
      agent: {
        async run() {
          throw new Error("private prompt Authorization=secret-key");
        },
      },
    })(state.run.id);
    const snapshot = await state.app.getRunSnapshot({ actorId: "owner", runId: state.run.id });
    expect(snapshot.run.error).toBe("EXECUTION_FAILED");
    expect(JSON.stringify(snapshot)).not.toContain("secret-key");
  });
});
