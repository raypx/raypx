import { createHash } from "node:crypto";
import { implement, ORPCError } from "@orpc/server";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import {
  executionGatewayContract,
  executionPayloadSchemas,
} from "@voidmix/contracts/execution-gateway";
import type { CloudApplication } from "@voidmix/application";
import type { ObjectStorage } from "@voidmix/core";
import { createModelGateway, readPublicSource, searchWeb, type ModelCallHooks } from "@voidmix/ai";

export const digestExecutionToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function createExecutionGateway(options: {
  app: CloudApplication;
  storage: ObjectStorage;
  model?: { provider: string; id: string; apiKey: string };
  searchApiKey?: string;
}) {
  const model = options.model
    ? await createModelGateway({
        model: { provider: options.model.provider, id: options.model.id },
        apiKey: options.model.apiKey,
      }).catch(() => null)
    : null;
  const active = new Set<AbortController>();
  const settlements = new Set<Promise<void>>();
  const os = implement(executionGatewayContract).$context<{ credential: string }>();
  const authorized = os.use(async ({ context, next, path }) => {
    const separator = context.credential.indexOf(".");
    if (separator < 1) throw new ORPCError("UNAUTHORIZED");
    try {
      const { grant, run } = await options.app.validateExecutionGrant({
        grantId: context.credential.slice(0, separator),
        tokenHash: digestExecutionToken(context.credential.slice(separator + 1)),
        action: path[0]!,
      });
      return next({
        context: {
          ...context,
          grant,
          run,
          fence: { runId: run.id, ownerId: grant.ownerId, epoch: grant.epoch },
        },
      });
    } catch {
      throw new ORPCError("FORBIDDEN");
    }
  });
  const router = {
    bootstrap: authorized.bootstrap.handler(async ({ context }) => {
      const conversation = await options.app.getConversation({
        actorId: context.run.requestedByUserId,
        conversationId: context.run.conversationId,
      });
      return {
        model:
          model && options.model
            ? { provider: options.model.provider, id: options.model.id }
            : null,
        history: conversation.runs
          .filter(
            (run) =>
              run.id !== context.run.id &&
              run.output &&
              run.createdAt.getTime() <= context.run.createdAt.getTime(),
          )
          .slice(0, 10)
          .reverse()
          .map((run) => `User: ${run.prompt}\nAssistant: ${run.output}`)
          .join("\n\n")
          .slice(-20_000),
      };
    }),
    invoke: authorized.invoke.handler(async ({ input, context }) => {
      // Identity and fencing are always injected by the host, never by the model or Runner.
      if (
        ["actorId", "scope", "ownerAccountId", "requestedByUserId"].some(
          (key) => key in input.payload,
        )
      )
        throw new ORPCError("FORBIDDEN");
      const candidate = Object.fromEntries(
        Object.entries(input.payload).filter(
          ([key]) => !["runId", "ownerId", "epoch"].includes(key),
        ),
      );
      const validated = executionPayloadSchemas[input.operation].safeParse(candidate);
      if (!validated.success) throw new ORPCError("BAD_REQUEST");
      const payload: Record<string, unknown> = { ...validated.data, ...context.fence };
      if (input.operation === "completeWorkerAsset") {
        const assetVersionId = payload["assetVersionId"];
        if (typeof assetVersionId !== "string") throw new ORPCError("BAD_REQUEST");
        const asset = await options.app.getAsset({
          actorId: context.run.requestedByUserId,
          assetVersionId,
        });
        await options.app.workerAssetByKey({ ...context.fence, objectKey: asset.objectKey });
        const stored = await options.storage.read(asset.objectKey);
        if (!stored) throw new ORPCError("NOT_FOUND");
        const hash = createHash("sha256");
        let size = 0;
        for await (const bytes of stored.body) {
          size += bytes.byteLength;
          hash.update(bytes);
        }
        if (size !== asset.byteSize || hash.digest("hex") !== asset.checksum)
          throw new ORPCError("BAD_REQUEST");
        return options.app.completeWorkerAsset({
          ...context.fence,
          assetVersionId,
          byteSize: size,
          checksum: asset.checksum,
        });
      }
      const command = options.app[input.operation] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
      return command(payload);
    }),
    research: authorized.research.handler(async ({ input, signal }) =>
      input.type === "search"
        ? searchWeb(input.query, {
            ...(options.searchApiKey ? { apiKey: options.searchApiKey } : {}),
            ...(signal ? { signal } : {}),
          })
        : readPublicSource(input.url, signal),
    ),
    object: authorized.object.handler(async ({ context, input }) => {
      const asset = await options.app.workerAssetByKey({ ...context.fence, objectKey: input.key });
      if (input.operation === "head") return options.storage.head(asset.objectKey);
      if (input.operation === "read") {
        const stored = await options.storage.read(asset.objectKey);
        if (!stored) return null;
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of stored.body) {
          size += chunk.byteLength;
          if (size > 10 * 1024 * 1024) throw new ORPCError("PAYLOAD_TOO_LARGE");
          chunks.push(chunk);
        }
        return { metadata: stored.metadata, bytes: Buffer.concat(chunks).toString("base64") };
      }
      if (asset.runId !== context.run.id || asset.published || !input.bytes)
        throw new ORPCError("FORBIDDEN");
      const bytes = Buffer.from(input.bytes, "base64");
      if (
        bytes.byteLength !== asset.byteSize ||
        bytes.byteLength > 10 * 1024 * 1024 ||
        createHash("sha256").update(bytes).digest("hex") !== asset.checksum
      )
        throw new ORPCError("BAD_REQUEST");
      return options.storage.put({
        key: asset.objectKey,
        body: bytes,
        contentType: asset.mediaType,
        checksumSha256: asset.checksum,
      });
    }),
    model: authorized.model.handler(async ({ input, context, signal }) => {
      if (!model) throw new ORPCError("SERVICE_UNAVAILABLE");
      const controller = new AbortController();
      active.add(controller);
      const stop = () => controller.abort("connection_closed");
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) stop();
      const monitor = setInterval(() => {
        void options.app.validateFence(context.fence).then(
          (run) => {
            if (run.cancelRequested) controller.abort("cancelled");
          },
          () => controller.abort("ownership_lost"),
        );
      }, 1000);
      monitor.unref();
      const remaining =
        (context.run.mode === "search" ? 60_000 : 20 * 60_000) -
        (Date.now() - (context.run.startedAt?.getTime() ?? Date.now()));
      const deadline = setTimeout(() => controller.abort("deadline"), Math.max(0, remaining));
      deadline.unref();
      const clear = () => {
        clearInterval(monitor);
        clearTimeout(deadline);
        active.delete(controller);
        signal?.removeEventListener("abort", stop);
      };
      const hooks: ModelCallHooks = {
        reserve: async (call) => {
          await options.app.reserveUsage({
            ...context.fence,
            callId: call.callId,
            executionId: input.executionId,
            provider: call.provider,
            model: call.model,
            reservedTokens: call.maxTokens,
            pricing: call.pricing,
          });
        },
        start: async (callId) => {
          await options.app.startUsage({ ...context.fence, callId, dispatchOnce: true });
        },
        settle: async (call) => {
          await options.app.reconcileUsage({
            callId: call.callId,
            started: call.started,
            ...(call.usage.inputTokens === null ? {} : { inputTokens: call.usage.inputTokens }),
            ...(call.usage.outputTokens === null ? {} : { outputTokens: call.usage.outputTokens }),
            ...(call.usage.cacheReadTokens === null
              ? {}
              : { cacheReadTokens: call.usage.cacheReadTokens }),
            ...(call.usage.cacheWriteTokens === null
              ? {}
              : { cacheWriteTokens: call.usage.cacheWriteTokens }),
          });
        },
      };
      try {
        const stream = await model.stream(input, hooks, controller.signal);
        settlements.add(stream.settled);
        void stream.settled.then(
          () => settlements.delete(stream.settled),
          () => settlements.delete(stream.settled),
        );
        return (async function* () {
          try {
            for await (const event of stream.events) yield event;
            await stream.settled;
          } finally {
            controller.abort("stream_closed");
            try {
              await stream.settled;
            } finally {
              clear();
            }
          }
        })();
      } catch {
        clear();
        throw new ORPCError("BAD_REQUEST", { message: "MODEL_CALL_REJECTED" });
      }
    }),
  };
  const handler = new RPCHandler(router, {
    plugins: [new BodyLimitPlugin({ maxBodySize: 15_000_000 })],
    allowMethods: (method) => method === "POST",
  });
  return {
    modelReady: model !== null,
    async fetch(request: Request) {
      const credential = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      try {
        const result = await handler.handle(request, {
          prefix: "/internal/execution",
          context: { credential },
        });
        const response = result.response ?? new Response(null, { status: 404 });
        response.headers.set("Cache-Control", "no-store");
        return response;
      } catch {
        return Response.json({ error: "EXECUTION_GATEWAY_REJECTED" }, { status: 403 });
      }
    },
    async close() {
      for (const controller of active) controller.abort("shutdown");
      await Promise.allSettled([...settlements]);
    },
  };
}
