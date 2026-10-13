import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import { createApiClient, createStreamingApiClient } from "@raypx/client";
import { InMemoryCloudRepository, InMemorySystemSettingsRepository } from "@raypx/db";
import { createFilesystemStorage } from "@raypx/storage";
import { createApiApp } from "./app.js";
import { createApiModules } from "./modules.js";
import { createHeaderSessionResolver } from "./session.js";
import type { SessionResolver } from "./session.js";
import { domainFixtures } from "./test-fixtures.js";

async function fixture(resolveSession: SessionResolver = createHeaderSessionResolver()) {
  const directory = await mkdtemp(join(tmpdir(), "raypx-cloud-api-"));
  const users = ["owner", "stranger"].map((id) => ({
    id,
    email: `${id}@example.test`,
    displayName: id,
  }));
  const repository = new InMemoryCloudRepository({ users });
  const cloud = createCloudApplication({ repository });
  const secret = "raypx-cloud-api-test-signing-secret";
  const storage = createFilesystemStorage({
    directory,
    signingSecret: secret,
    publicBaseUrl: "http://raypx.test",
  });
  const app = createApiApp({
    modules: createApiModules({
      ...domainFixtures(),
      cloud,
      objectStorage: storage,
      cloudCapabilities: {
        search: true,
        computer: true,
        delegation: true,
        export: true,
        unavailableReason: null,
      },
      settings: new InMemorySystemSettingsRepository(),
      mailFallback: {
        enabled: { value: false, source: "default" },
        from: { value: null, source: "missing" },
        fromName: { value: "Raypx", source: "default" },
        templatesBaseUrl: { value: null, source: "missing" },
        resendApiKey: { value: null, source: "missing" },
      },
    }),
    allowedOrigins: ["http://raypx.test"],
    authHandler: async () => new Response(null, { status: 404 }),
    resolveSession,
    localStorage: { storage, signingSecret: secret },
  });
  const client = (actorId?: string, role: "user" | "admin" = "user") =>
    createApiClient({
      baseUrl: "http://raypx.test",
      headers: actorId
        ? {
            "x-raypx-user-id": actorId,
            "x-raypx-role": role,
            "x-raypx-email": `${actorId}@example.test`,
          }
        : {},
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    });
  return {
    app,
    cloud,
    repository,
    storage,
    client,
    close: () => rm(directory, { recursive: true, force: true }),
  };
}

describe("cloud API through typed client", () => {
  it.each(["revoked", "changed", "expired"] as const)(
    "stops both private streams when the original session is %s",
    async (change) => {
      const resolveHeader = createHeaderSessionResolver();
      let invalid = false;
      const f = await fixture(async (request) => {
        const session = await resolveHeader(request);
        if (!invalid || !session) return session;
        if (change === "revoked") return null;
        return change === "changed"
          ? { ...session, user: { ...session.user, id: "stranger" } }
          : { ...session, expiresAt: new Date(0) };
      });
      const controller = new AbortController();
      try {
        const conversation = await f.client("owner").cloud.conversations.create({
          title: "Private stream",
          idempotencyKey: "private-conversation",
        });
        const { run } = await f.client("owner").cloud.conversations.sendTurn({
          conversationId: conversation.id,
          mode: "search",
          prompt: "Private research",
          attachmentIds: [],
          idempotencyKey: "private-turn",
        });
        await f.cloud.claim({ runId: run.id, ownerId: "private-worker" });
        const streams = createStreamingApiClient({
          baseUrl: "http://raypx.test",
          headers: { "x-raypx-user-id": "owner" },
          fetch: async (input, init) => f.app.fetch(new Request(input, init)),
        });
        const conversationEvents = (
          await streams.cloud.conversations.stream(
            { conversationId: conversation.id },
            { signal: controller.signal },
          )
        )[Symbol.asyncIterator]();
        const runEvents = (
          await streams.cloud.runs.stream(
            { runId: run.id, afterSequence: 0 },
            { signal: controller.signal },
          )
        )[Symbol.asyncIterator]();
        expect((await conversationEvents.next()).done).toBe(false);
        expect((await runEvents.next()).done).toBe(false);
        invalid = true;
        await Promise.all([
          expect(conversationEvents.next()).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
          expect(runEvents.next()).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
        ]);
        expect(await f.repository.read((tx) => tx.userActive("owner"))).toBe(true);
      } finally {
        controller.abort();
        await f.close();
      }
    },
  );

  it("streams events appended between a snapshot and subscription without ordinary RPC batching", async () => {
    const f = await fixture();
    try {
      const client = f.client("owner");
      const conversation = await client.cloud.conversations.create({
        title: "Streaming",
        idempotencyKey: "stream-conversation",
      });
      const created = await client.cloud.conversations.sendTurn({
        conversationId: conversation.id,
        prompt: "Search",
        mode: "search",
        attachmentIds: [],
        idempotencyKey: "stream-turn",
      });
      const claimed = await f.cloud.claim({ runId: created.run.id, ownerId: "stream-worker" });
      const fence = { runId: created.run.id, ownerId: "stream-worker", epoch: claimed!.epoch };
      const snapshot = await client.cloud.runs.snapshot({ runId: created.run.id });
      await f.cloud.appendEvent({
        ...fence,
        eventId: "delta-1",
        type: "message.delta",
        payload: { text: "Research answer" },
      });
      await f.cloud.finish({ ...fence, status: "succeeded", output: "Research answer" });
      const streams = createStreamingApiClient({
        baseUrl: "http://raypx.test",
        headers: {
          "x-raypx-user-id": "owner",
          "x-raypx-role": "user",
          "x-raypx-email": "owner@example.test",
        },
        fetch: async (input, init) => f.app.fetch(new Request(input, init)),
      });
      const received = [];
      for await (const event of await streams.cloud.runs.stream({
        runId: created.run.id,
        afterSequence: snapshot.cursor,
      }))
        received.push(event);
      expect(received.map((event) => event.sequence)).toEqual(
        received.map((_, index) => snapshot.cursor + index + 1),
      );
      expect(
        received.some(
          (event) => event.type === "message.delta" && event.payload.text === "Research answer",
        ),
      ).toBe(true);
      expect(received.at(-1)?.payload.status).toBe("succeeded");
      expect(received.every((event) => event.occurredAt instanceof Date)).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("rechecks live account access without elevating legacy session roles", async () => {
    const f = await fixture();
    try {
      const owner = f.client("owner");
      const conversation = await owner.cloud.conversations.create({
        title: "Private",
        idempotencyKey: "private-conversation",
      });
      const { run } = await owner.cloud.conversations.sendTurn({
        conversationId: conversation.id,
        prompt: "Private prompt must stay private",
        mode: "search",
        attachmentIds: [],
        idempotencyKey: "private-turn",
      });
      const stranger = f.client("stranger", "admin");
      await expect(stranger.cloud.runs.snapshot({ runId: run.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        stranger.cloud.conversations.get({ conversationId: conversation.id }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      f.repository.setUserActive("owner", false);
      await expect(owner.cloud.runs.snapshot({ runId: run.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    } finally {
      await f.close();
    }
  });
  it("authenticates scope and queues one durable run for an idempotent turn", async () => {
    const f = await fixture();
    try {
      const client = f.client("owner");
      const conversation = await client.cloud.conversations.create({
        title: "Research",
        idempotencyKey: "conversation-1",
      });
      expect(conversation.createdAt).toBeInstanceOf(Date);
      expect(conversation.scope).toEqual({ type: "personal", ownerUserId: "owner" });
      const input = {
        conversationId: conversation.id,
        prompt: "Research a topic",
        mode: "search" as const,
        idempotencyKey: "turn-1",
        attachmentIds: [],
      };
      const first = await client.cloud.conversations.sendTurn(input);
      const duplicate = await client.cloud.conversations.sendTurn(input);
      expect(duplicate.run.id).toBe(first.run.id);
      await expect(
        f.client().cloud.conversations.get({ conversationId: conversation.id }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        f.client("stranger").cloud.conversations.get({ conversationId: conversation.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        client.cloud.conversations.sendTurn({ ...input, prompt: "Changed" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await f.close();
    }
  });
  it("checks actual uploaded bytes before publishing and authorizes downloads", async () => {
    const f = await fixture();
    try {
      const client = f.client("owner");
      const body = new TextEncoder().encode("name,value\nalpha,10\n");
      const checksum = createHash("sha256").update(body).digest("hex");
      const intent = await client.cloud.assets.createUpload({
        name: "input.csv",
        mediaType: "text/csv",
        byteSize: body.length,
        checksum,
        idempotencyKey: "upload-1",
      });
      await expect(
        client.cloud.assets.completeUpload({
          assetVersionId: intent.asset.id,
          idempotencyKey: "complete-1",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const form = new FormData();
      for (const [key, value] of Object.entries(intent.upload.fields)) form.append(key, value);
      form.append("file", new Blob([body], { type: "text/csv" }), "input.csv");
      expect(
        (await f.app.fetch(new Request(intent.upload.url, { method: "POST", body: form }))).status,
      ).toBe(204);
      const asset = await client.cloud.assets.completeUpload({
        assetVersionId: intent.asset.id,
        idempotencyKey: "complete-1",
      });
      expect(asset.published).toBe(true);
      const link = await client.cloud.assets.download({ assetVersionId: asset.id });
      expect(await (await f.app.fetch(new Request(link.download.url))).text()).toBe(
        new TextDecoder().decode(body),
      );
      await expect(
        f.client("stranger").cloud.assets.download({ assetVersionId: asset.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await f.close();
    }
  });
  it("publishes a revision atomically and completes only after user acceptance", async () => {
    const f = await fixture();
    try {
      const actorId = "owner";
      const client = f.client(actorId);
      const conversation = await client.cloud.conversations.create({
        title: "Computer",
        idempotencyKey: "conversation-2",
      });
      const created = await client.cloud.conversations.sendTurn({
        conversationId: conversation.id,
        prompt: "Create a report",
        mode: "computer",
        attachmentIds: [],
        idempotencyKey: "turn-2",
      });
      const claimed = await f.cloud.claim({ runId: created.run.id, ownerId: "worker-test" });
      expect(claimed).not.toBeNull();
      const fence = { runId: created.run.id, ownerId: "worker-test", epoch: claimed!.epoch };
      const execution = await f.cloud.startExecution({
        ...fence,
        role: "main",
        prompt: created.run.prompt,
      });
      await f.cloud.reserveUsage({
        ...fence,
        callId: "model-call-1",
        executionId: execution.id,
        provider: "test",
        model: "test",
        reservedTokens: 100,
      });
      await f.cloud.startUsage({ ...fence, callId: "model-call-1" });
      await f.cloud.settleUsage({
        ...fence,
        callId: "model-call-1",
        inputTokens: 12,
        outputTokens: 8,
      });
      const body = new TextEncoder().encode("# Report\nVerified delivery.");
      const checksum = createHash("sha256").update(body).digest("hex");
      const asset = await f.cloud.createWorkerAsset({
        ...fence,
        name: "report.md",
        mediaType: "text/markdown",
        byteSize: body.length,
        checksum,
        idempotencyKey: "generated-1",
      });
      await f.storage.put({
        key: asset.objectKey,
        body,
        contentType: asset.mediaType,
        checksumSha256: checksum,
      });
      await f.cloud.completeWorkerAsset({
        ...fence,
        assetVersionId: asset.id,
        byteSize: body.length,
        checksum,
      });
      const finished = await f.cloud.finishWithRevision({
        ...fence,
        assetVersionIds: [asset.id],
        summary: "Report",
        output: "Delivery ready",
      });
      expect((await client.cloud.tasks.get({ taskId: created.task!.id })).task.status).toBe(
        "review",
      );
      const task = await client.cloud.tasks.acceptRevision({
        taskId: created.task!.id,
        revisionId: finished.revision.id,
        roundId: finished.revision.roundId,
        goalVersion: finished.revision.goalVersion,
        idempotencyKey: "accept-1",
      });
      expect(task.status).toBe("completed");
      expect((await client.cloud.usage.get({})).inputTokens).toBe(12);
    } finally {
      await f.close();
    }
  });
});
