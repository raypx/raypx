import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import { InMemoryCloudRepository } from "@raypx/db";
import { createCloudExecutor } from "./execution.js";

async function fixture() {
  const repository = new InMemoryCloudRepository({ users: [{ id: "owner" }] });
  const app = createCloudApplication({ repository });
  const conversation = await app.createConversation({
    actorId: "owner",
    title: "Unavailable execution",
    idempotencyKey: "conversation",
  });
  const { run } = await app.sendTurn({
    actorId: "owner",
    conversationId: conversation.id,
    mode: "search",
    prompt: "Research",
    idempotencyKey: "turn",
  });
  const claimed = (await app.claim({ runId: run.id, ownerId: "host" }))!;
  const fence = { runId: run.id, ownerId: "host", epoch: claimed.epoch };
  const execute = createCloudExecutor({ app, claimed, ownerId: "host" });
  const snapshot = () => app.getRunSnapshot({ actorId: "owner", runId: run.id });
  return { app, repository, claimed, fence, execute, snapshot };
}

describe("unavailable cloud execution", () => {
  it("settles claimed Runs explicitly and releases quota without starting model work", async () => {
    const f = await fixture();
    await f.execute(f.fence.runId);
    const snapshot = await f.snapshot();
    expect(snapshot.run).toMatchObject({
      status: "failed",
      error: "MODEL_UNAVAILABLE",
      output: null,
    });
    expect(snapshot.executions).toEqual([]);
    expect((await f.app.getUsage({ actorId: "owner" })).activeRuns).toBe(0);
    const events = await f.app.listEvents({
      actorId: "owner",
      runId: f.fence.runId,
      afterSequence: 0,
      limit: 100,
    });
    expect(
      events.items.some(
        (event) => event.type === "run.status" && event.payload.status === "failed",
      ),
    ).toBe(true);
  });

  it("applies pending cancellation before the unavailable failure", async () => {
    const f = await fixture();
    const command = await f.app.createCommand({
      actorId: "owner",
      runId: f.fence.runId,
      type: "cancel",
      idempotencyKey: "cancel",
    });
    await f.execute(f.fence.runId);
    expect((await f.snapshot()).run).toMatchObject({ status: "cancelled", error: null });
    expect(await f.repository.read((tx) => tx.get("commands", command.id))).toMatchObject({
      status: "applied",
    });
  });

  it("rejects steering commands when no model can apply them", async () => {
    const f = await fixture();
    const command = await f.app.createCommand({
      actorId: "owner",
      runId: f.fence.runId,
      type: "steer",
      text: "Use a different source",
      idempotencyKey: "steer",
    });
    await f.execute(f.fence.runId);
    expect(await f.repository.read((tx) => tx.get("commands", command.id))).toMatchObject({
      status: "rejected",
    });
    expect((await f.snapshot()).run.error).toBe("MODEL_UNAVAILABLE");
  });

  it.each([
    { reason: "interrupted", error: "interrupted" },
    { reason: "budget_exceeded", error: "BUDGET_EXCEEDED" },
  ])("preserves a Host $reason abort during ownership validation", async ({ reason, error }) => {
    const f = await fixture();
    const controller = new AbortController();
    const execute = createCloudExecutor({
      app: {
        ...f.app,
        workerControl: async (fence) => {
          const snapshot = await f.app.workerControl(fence);
          controller.abort(reason);
          return snapshot;
        },
      },
      claimed: f.claimed,
      ownerId: "host",
    });
    await execute(f.fence.runId, controller.signal);
    expect((await f.snapshot()).run).toMatchObject({ status: "failed", error });
  });

  it("protects a previously completed Run from stale unavailable settlement", async () => {
    const f = await fixture();
    await f.app.finish({ ...f.fence, status: "succeeded", output: "Completed result" });
    await f.execute(f.fence.runId);
    expect((await f.snapshot()).run).toMatchObject({
      status: "succeeded",
      output: "Completed result",
      error: null,
    });
  });

  it("cannot settle another execution owner or epoch", async () => {
    const f = await fixture();
    await f.repository.transaction([`run:${f.fence.runId}`], async (tx) => {
      const run = (await tx.get("runs", f.fence.runId))!;
      await tx.save("runs", { ...run, ownerId: "new-host", epoch: run.epoch + 1 });
    });
    await f.execute(f.fence.runId);
    expect((await f.snapshot()).run).toMatchObject({
      status: "running",
      ownerId: "new-host",
      epoch: f.fence.epoch + 1,
      error: null,
    });
  });

  it("rejects execution requests that do not match the claimed Run", async () => {
    const f = await fixture();
    await expect(f.execute("another-run")).rejects.toThrow("does not match");
    expect((await f.snapshot()).run.status).toBe("running");
  });
});
