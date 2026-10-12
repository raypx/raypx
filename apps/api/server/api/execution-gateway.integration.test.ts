import { createHash } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { describe, expect, it, vi } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import { InMemoryCloudRepository } from "@raypx/db";
import { createMemoryStorage } from "@raypx/storage";
import {
  executionGatewayContract,
  executionOutputSchemas,
  executionObjectOutputSchemas,
} from "@raypx/contracts/execution-gateway";
import { createExecutionGateway, digestExecutionToken } from "./execution-gateway.js";
import * as ai from "@raypx/ai";
import { cloudToolNames } from "@raypx/core";

async function fixture(
  model?: { provider: string; id: string; apiKey: string },
  mode: "search" | "computer" = "search",
) {
  let now = new Date();
  const app = createCloudApplication({
    repository: new InMemoryCloudRepository({
      users: [{ id: "owner", email: "owner@example.test" }],
    }),
    now: () => now,
  });
  const conversation = await app.createConversation({
    actorId: "owner",
    title: "Gateway",
    idempotencyKey: "conversation",
  });
  const { run } = await app.sendTurn({
    actorId: "owner",
    conversationId: conversation.id,
    prompt: "Research",
    mode,
    attachmentIds: [],
    idempotencyKey: "turn",
  });
  await app.acceptQueued({ runId: run.id });
  const claimed = (await app.claim({ runId: run.id, ownerId: "worker" }))!;
  const fence = { runId: run.id, ownerId: "worker", epoch: claimed.epoch };
  const grantId = crypto.randomUUID(),
    token = "private-random-test-token";
  await app.registerExecutionGrant({
    ...fence,
    grantId,
    tokenHash: digestExecutionToken(token),
    expiresAt: claimed.run.leaseExpiresAt!,
    actions: ["bootstrap", "invoke", "object", "model"],
  });
  const storage = createMemoryStorage();
  const gateway = await createExecutionGateway({ app, storage, ...(model ? { model } : {}) });
  const client = (
    credential = `${grantId}.${token}`,
  ): ContractRouterClient<typeof executionGatewayContract> =>
    createORPCClient(
      new RPCLink({
        url: "/internal/execution",
        origin: "http://gateway.test",
        headers: { authorization: `Bearer ${credential}` },
        fetch: (url, init) => gateway.fetch(new Request(url, init)),
      }),
    );
  return {
    app,
    storage,
    gateway,
    client,
    fence,
    grantId,
    expire() {
      now = new Date(now.getTime() + 31_000);
    },
  };
}
describe("private execution Gateway", () => {
  it("injects the trusted tool directory and bootstrap exposes no provider credentials", async () => {
    const factory = vi.spyOn(ai, "createModelGateway").mockResolvedValue({
      stream: async () => {
        throw new Error("provider dispatch is not expected");
      },
    });
    try {
      const f = await fixture({
        provider: "provider",
        id: "model",
        apiKey: "test-only-credential",
      });
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({ allowedTools: cloudToolNames }),
      );
      expect(await f.client().bootstrap({})).toEqual({
        model: { provider: "provider", id: "model" },
        history: "",
      });
      await f.gateway.close();
    } finally {
      factory.mockRestore();
    }
  });
  it("requires a persistent current grant and never accepts runner identity", async () => {
    const f = await fixture();
    await expect(f.client("invalid.token").bootstrap({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      f.client().invoke({ operation: "workerAssets", payload: { actorId: "stranger" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.client().invoke({ operation: "workerAssets", payload: { allowedTools: ["shell"] } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const control = executionOutputSchemas.workerControl.parse(
      await f
        .client()
        .invoke({ operation: "workerControl", payload: { runId: "another", epoch: 999 } }),
    );
    expect(control.run.id).toBe(f.fence.runId);
    expect(control.run.createdAt).toBeInstanceOf(Date);
    expect(
      executionOutputSchemas.workerAssets.parse(
        await f.client().invoke({ operation: "workerAssets", payload: {} }),
      ),
    ).toEqual([]);
    await expect(
      f.client().invoke({ operation: "finish", payload: { status: "queued" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      f.client().invoke({
        operation: "acknowledgeCommand",
        payload: { commandId: "fake", status: "pending" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      f.client().invoke({
        operation: "appendEvent",
        payload: {
          eventId: "event",
          type: "artifact.published",
          payload: { assetVersionId: "fake" },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      f.client().invoke({
        operation: "appendEvent",
        payload: {
          eventId: "event",
          type: "message.delta",
          payload: { messageId: "x".repeat(201), text: "invalid" },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await f.app.revokeExecutionGrant({ grantId: f.grantId });
    await expect(f.client().bootstrap({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.gateway.close();
  });
  it("expired owner grants cannot call the Gateway or renew", async () => {
    const f = await fixture();
    f.expire();
    await expect(f.client().bootstrap({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.app.heartbeat(f.fence)).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" });
    await f.gateway.close();
  });
  it("verifies transferred bytes and confines objects to the claimed Run", async () => {
    const f = await fixture(undefined, "computer");
    const body = Buffer.from("verified content");
    const checksum = createHash("sha256").update(body).digest("hex");
    const asset = executionOutputSchemas.createWorkerAsset.parse(
      await f.client().invoke({
        operation: "createWorkerAsset",
        payload: {
          name: "report.md",
          mediaType: "text/markdown",
          byteSize: body.byteLength,
          checksum,
          idempotencyKey: "file",
        },
      }),
    );
    await expect(
      f.client().object({ operation: "head", key: "outside/object" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    await expect(
      f.client().object({
        operation: "put",
        key: asset.objectKey,
        bytes: Buffer.from("wrong").toString("base64"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await f
      .client()
      .object({ operation: "put", key: asset.objectKey, bytes: body.toString("base64") });
    const completed = executionOutputSchemas.completeWorkerAsset.parse(
      await f.client().invoke({
        operation: "completeWorkerAsset",
        payload: {
          assetVersionId: asset.id,
          byteSize: 1,
          checksum: "0".repeat(64),
        },
      }),
    );
    expect(completed.verifiedAt).toBeInstanceOf(Date);
    expect(completed.published).toBe(false);
    const download = executionObjectOutputSchemas.read.parse(
      await f.client().object({ operation: "read", key: asset.objectKey }),
    );
    expect(download).not.toBeNull();
    expect(Buffer.from(download!.bytes, "base64")).toEqual(body);
    const published = executionOutputSchemas.finishWithRevision.parse(
      await f.client().invoke({
        operation: "finishWithRevision",
        payload: { assetVersionIds: [asset.id], summary: "Verified report", output: "Ready" },
      }),
    );
    expect(published.run.status).toBe("succeeded");
    expect(published.revision.assetVersionIds).toEqual([asset.id]);
    expect(published.revision.createdAt).toBeInstanceOf(Date);
    await f.gateway.close();
  });
  it.each(["finish", "interrupt"] as const)(
    "dispatches the execution lifecycle with native results through %s",
    async (operation) => {
      const f = await fixture();
      const client = f.client();
      const execution = executionOutputSchemas.startExecution.parse(
        await client.invoke({
          operation: "startExecution",
          payload: { role: "main", prompt: "Research" },
        }),
      );
      expect(execution.status).toBe("running");
      expect(execution.createdAt).toBeInstanceOf(Date);
      const event = executionOutputSchemas.appendEvent.parse(
        await client.invoke({
          operation: "appendEvent",
          payload: {
            eventId: "completed-message",
            executionId: execution.id,
            type: "message.completed",
            payload: { messageId: "message", text: "Answer" },
          },
        }),
      );
      expect(event.occurredAt).toBeInstanceOf(Date);
      const command = await f.app.createCommand({
        actorId: "owner",
        runId: f.fence.runId,
        type: "steer",
        text: "Focus",
        idempotencyKey: "steer",
      });
      expect(
        executionOutputSchemas.acknowledgeCommand.parse(
          await client.invoke({
            operation: "acknowledgeCommand",
            payload: { commandId: command.id, status: "applied" },
          }),
        ).status,
      ).toBe("applied");
      expect(
        executionOutputSchemas.finishExecution.parse(
          await client.invoke({
            operation: "finishExecution",
            payload: {
              executionId: execution.id,
              status: "succeeded",
              output: "Answer",
            },
          }),
        ).output,
      ).toBe("Answer");
      const result =
        operation === "finish"
          ? executionOutputSchemas.finish.parse(
              await client.invoke({
                operation,
                payload: { status: "succeeded", output: "Answer" },
              }),
            )
          : executionOutputSchemas.interrupt.parse(await client.invoke({ operation, payload: {} }));
      expect(result.status).toBe(operation === "finish" ? "succeeded" : "failed");
      expect(result.completedAt).toBeInstanceOf(Date);
      await f.gateway.close();
    },
  );
  it("rejects invalid domain responses before exposing them to the Runner", async () => {
    const f = await fixture();
    const control = f.app.workerControl;
    f.app.workerControl = async (fence) => {
      const snapshot = await control(fence);
      return { ...snapshot, run: { ...snapshot.run, createdAt: new Date(Number.NaN) } };
    };
    await expect(
      f.client().invoke({ operation: "workerControl", payload: {} }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    const asset = await f.app.createWorkerAsset({
      ...f.fence,
      name: "invalid.txt",
      mediaType: "text/plain",
      byteSize: 1,
      checksum: "a".repeat(64),
      idempotencyKey: "invalid-metadata",
    });
    f.storage.head = async () => ({
      key: asset.objectKey,
      byteSize: -1,
      contentType: "text/plain",
      checksumSha256: "a".repeat(64),
    });
    await expect(
      f.client().object({ operation: "head", key: asset.objectKey }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    await f.gateway.close();
  });
});
