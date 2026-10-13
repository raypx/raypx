import { createHash } from "node:crypto";
import { implement, ORPCError } from "@orpc/server";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import {
  executionGatewayContract,
  executionPayloadSchemas,
  executionOutputSchemas,
  executionObjectOutputSchemas,
} from "@raypx/contracts/execution-gateway";
import type { CloudApplication } from "@raypx/application";
import type { ObjectStorage } from "@raypx/core";

export const digestExecutionToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function createExecutionGateway(options: {
  app: CloudApplication;
  storage: ObjectStorage;
}) {
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
        model: null,
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
      const parse = <T>(schema: { parse(value: unknown): T }): T => {
        try {
          return schema.parse(candidate);
        } catch {
          throw new ORPCError("BAD_REQUEST");
        }
      };
      switch (input.operation) {
        case "workerControl":
          parse(executionPayloadSchemas.workerControl);
          return executionOutputSchemas.workerControl.parse(
            await options.app.workerControl(context.fence),
          );
        case "workerAssets":
          parse(executionPayloadSchemas.workerAssets);
          return executionOutputSchemas.workerAssets.parse(
            await options.app.workerAssets(context.fence),
          );
        case "startExecution": {
          const payload = parse(executionPayloadSchemas.startExecution);
          return executionOutputSchemas.startExecution.parse(
            await options.app.startExecution({
              ...context.fence,
              role: payload.role,
              prompt: payload.prompt,
              ...(payload.parentId !== undefined ? { parentId: payload.parentId } : {}),
            }),
          );
        }
        case "appendEvent": {
          const payload = parse(executionPayloadSchemas.appendEvent);
          return executionOutputSchemas.appendEvent.parse(
            await options.app.appendEvent({
              ...context.fence,
              eventId: payload.eventId,
              type: payload.type,
              payload: payload.payload,
              ...(payload.executionId !== undefined ? { executionId: payload.executionId } : {}),
            }),
          );
        }
        case "createWorkerAsset":
          return executionOutputSchemas.createWorkerAsset.parse(
            await options.app.createWorkerAsset({
              ...parse(executionPayloadSchemas.createWorkerAsset),
              ...context.fence,
            }),
          );
        case "completeWorkerAsset": {
          const { assetVersionId } = parse(executionPayloadSchemas.completeWorkerAsset);
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
          return executionOutputSchemas.completeWorkerAsset.parse(
            await options.app.completeWorkerAsset({
              ...context.fence,
              assetVersionId,
              byteSize: size,
              checksum: asset.checksum,
            }),
          );
        }
        case "finishExecution": {
          const payload = parse(executionPayloadSchemas.finishExecution);
          return executionOutputSchemas.finishExecution.parse(
            await options.app.finishExecution({
              ...context.fence,
              executionId: payload.executionId,
              status: payload.status,
              ...(payload.output !== undefined ? { output: payload.output } : {}),
            }),
          );
        }
        case "finish": {
          const payload = parse(executionPayloadSchemas.finish);
          return executionOutputSchemas.finish.parse(
            await options.app.finish({
              ...context.fence,
              status: payload.status,
              ...(payload.output !== undefined ? { output: payload.output } : {}),
              ...(payload.error !== undefined ? { error: payload.error } : {}),
            }),
          );
        }
        case "finishWithRevision":
          return executionOutputSchemas.finishWithRevision.parse(
            await options.app.finishWithRevision({
              ...parse(executionPayloadSchemas.finishWithRevision),
              ...context.fence,
            }),
          );
        case "interrupt":
          parse(executionPayloadSchemas.interrupt);
          return executionOutputSchemas.interrupt.parse(await options.app.interrupt(context.fence));
        case "acknowledgeCommand":
          return executionOutputSchemas.acknowledgeCommand.parse(
            await options.app.acknowledgeCommand({
              ...parse(executionPayloadSchemas.acknowledgeCommand),
              ...context.fence,
            }),
          );
      }
    }),
    research: authorized.research.handler(async () => {
      throw new ORPCError("SERVICE_UNAVAILABLE");
    }),
    object: authorized.object.handler(async ({ context, input }) => {
      const asset = await options.app.workerAssetByKey({ ...context.fence, objectKey: input.key });
      if (input.operation === "head")
        return executionObjectOutputSchemas.head.parse(await options.storage.head(asset.objectKey));
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
        return executionObjectOutputSchemas.read.parse({
          metadata: stored.metadata,
          bytes: Buffer.concat(chunks).toString("base64"),
        });
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
      return executionObjectOutputSchemas.put.parse(
        await options.storage.put({
          key: asset.objectKey,
          body: bytes,
          contentType: asset.mediaType,
          checksumSha256: asset.checksum,
        }),
      );
    }),
    model: authorized.model.handler(async () => {
      throw new ORPCError("SERVICE_UNAVAILABLE");
    }),
  };
  const handler = new RPCHandler(router, {
    plugins: [new BodyLimitPlugin({ maxBodySize: 15_000_000 })],
    allowMethods: (method) => method === "POST",
  });
  return {
    modelReady: false,
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
    close: () => Promise.resolve(),
  };
}
