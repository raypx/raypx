import { implement, ORPCError } from "@orpc/server";
import { createHash } from "node:crypto";
import { RPCHandler } from "@orpc/server/fetch";
import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import { InMemoryCloudRepository } from "@raypx/db";
import { createMemoryStorage } from "@raypx/storage";
import { executionGatewayContract, executionOperations } from "@raypx/contracts/execution-gateway";
import { createExecutionClient } from "./execution-client.js";

async function fixture() {
  const app = createCloudApplication({
    repository: new InMemoryCloudRepository({ users: [{ id: "owner" }] }),
  });
  const conversation = await app.createConversation({
    actorId: "owner",
    title: "Client",
    idempotencyKey: "client-conversation",
  });
  const { run } = await app.sendTurn({
    actorId: "owner",
    conversationId: conversation.id,
    mode: "search",
    prompt: "Client",
    idempotencyKey: "client-turn",
  });
  const claimed = (await app.claim({ runId: run.id, ownerId: "host" }))!;
  const fence = { runId: run.id, ownerId: "host", epoch: claimed.epoch };
  const storage = createMemoryStorage();
  const metadata = await storage.put({
    key: "object",
    body: Buffer.from("hello"),
    contentType: "text/plain",
    checksumSha256: createHash("sha256").update("hello").digest("hex"),
  });
  let wrongShape = false;
  const os = implement(executionGatewayContract);
  const handler = new RPCHandler({
    bootstrap: os.bootstrap.handler(() => ({ model: null, history: "" })),
    invoke: os.invoke.handler(async ({ input }) => {
      if (wrongShape || input.operation === "workerControl") return app.workerControl(fence);
      if (input.operation === "workerAssets") return app.workerAssets(fence);
      throw new ORPCError("NOT_IMPLEMENTED");
    }),
    object: os.object.handler(({ input }) => {
      if (wrongShape || input.operation === "read")
        return { metadata, bytes: Buffer.from("hello").toString("base64") };
      return metadata;
    }),
    research: os.research.handler(({ input }) =>
      wrongShape || input.type === "search"
        ? [{ url: "https://source.test", title: "Source", excerpt: "Evidence" }]
        : { url: input.url, title: "Source", text: "Full source" },
    ),
  });
  const gateway = createExecutionClient("http://gateway.test", "grant.token", {
    fetch: async (url, init) => {
      const result = await handler.handle(new Request(url, init), {
        prefix: "/internal/execution",
        context: {},
      });
      return result.matched ? result.response : new Response(null, { status: 404 });
    },
  });
  return {
    gateway,
    fence,
    metadata,
    malformed() {
      wrongShape = true;
    },
  };
}

describe("Runner execution client", () => {
  it("exposes only execution methods and restores native dates and object bytes", async () => {
    const f = await fixture();
    expect(Object.keys(f.gateway.app).sort()).toEqual([...executionOperations].sort());
    expect(Object.keys(f.gateway.storage).sort()).toEqual(["head", "put", "read"]);
    for (const operation of [
      "claim",
      "heartbeat",
      "getConversation",
      "reserveUsage",
      "startUsage",
      "settleUsage",
    ])
      expect(f.gateway.app).not.toHaveProperty(operation);
    const control = await f.gateway.app.workerControl(f.fence);
    expect(control.run.createdAt).toBeInstanceOf(Date);
    expect(control.run.id).toBe(f.fence.runId);
    expect(await f.gateway.app.workerAssets(f.fence)).toEqual([]);
    expect(await f.gateway.storage.head("object")).toEqual(f.metadata);
    const stored = await f.gateway.storage.read("object");
    expect(stored).not.toBeNull();
    const bytes: Uint8Array[] = [];
    for await (const chunk of stored!.body) bytes.push(chunk);
    expect(Buffer.concat(bytes).toString()).toBe("hello");
    expect(await f.gateway.research.search("query")).toHaveLength(1);
    expect(await f.gateway.research.read("https://source.test")).toMatchObject({
      text: "Full source",
    });
  });

  it("rejects a response for another operation even when the invoke union accepts it", async () => {
    const f = await fixture();
    f.malformed();
    await expect(f.gateway.app.workerAssets(f.fence)).rejects.toThrow();
    await expect(f.gateway.storage.head("object")).rejects.toThrow();
    await expect(f.gateway.research.read("https://source.test")).rejects.toThrow();
  });
});
