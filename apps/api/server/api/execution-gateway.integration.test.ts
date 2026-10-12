import { createHash } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@voidmix/application";
import { InMemoryCloudRepository } from "@voidmix/db";
import { createMemoryStorage } from "@voidmix/storage";
import { executionGatewayContract } from "@voidmix/contracts/execution-gateway";
import { createExecutionGateway, digestExecutionToken } from "./execution-gateway.js";

async function fixture() {
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
    mode: "search",
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
  const gateway = await createExecutionGateway({ app, storage });
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
  it("requires a persistent current grant and never accepts runner identity", async () => {
    const f = await fixture();
    await expect(f.client("invalid.token").bootstrap({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      f.client().invoke({ operation: "workerAssets", payload: { actorId: "stranger" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const control = (await f
      .client()
      .invoke({ operation: "workerControl", payload: { runId: "another", epoch: 999 } })) as {
      run: { id: string; createdAt: Date };
    };
    expect(control.run.id).toBe(f.fence.runId);
    expect(control.run.createdAt).toBeInstanceOf(Date);
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
    const f = await fixture();
    const body = Buffer.from("verified content");
    const checksum = createHash("sha256").update(body).digest("hex");
    const asset = await f.app.createWorkerAsset({
      ...f.fence,
      name: "report.md",
      mediaType: "text/markdown",
      byteSize: body.byteLength,
      checksum,
      idempotencyKey: "file",
    });
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
    const completed = (await f.client().invoke({
      operation: "completeWorkerAsset",
      payload: {
        assetVersionId: asset.id,
        byteSize: 1,
        checksum: "0".repeat(64),
      },
    })) as { verifiedAt: Date | null; published: boolean };
    expect(completed.verifiedAt).toBeInstanceOf(Date);
    expect(completed.published).toBe(false);
    const download = (await f.client().object({ operation: "read", key: asset.objectKey })) as {
      bytes: string;
    };
    expect(Buffer.from(download.bytes, "base64")).toEqual(body);
    await f.gateway.close();
  });
});
