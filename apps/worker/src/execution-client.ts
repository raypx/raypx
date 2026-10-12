import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import {
  executionGatewayContract,
  executionOutputSchemas,
  executionObjectOutputSchemas,
  executionResearchOutputSchemas,
} from "@raypx/contracts/execution-gateway";
import type { ObjectStorage } from "@raypx/core";
import type { CloudExecutionOperations } from "./cloud.js";

export function createExecutionClient(
  url: string,
  credential: string,
  options: { fetch?: (url: string, init: RequestInit) => Promise<Response> } = {},
) {
  const client: ContractRouterClient<typeof executionGatewayContract> = createORPCClient(
    new RPCLink({
      url: "/internal/execution",
      origin: new URL(url).origin,
      headers: { authorization: `Bearer ${credential}` },
      ...options,
    }),
  );
  const app: CloudExecutionOperations = {
    workerControl: async (payload) =>
      executionOutputSchemas.workerControl.parse(
        await client.invoke({ operation: "workerControl", payload }),
      ),
    workerAssets: async (payload) =>
      executionOutputSchemas.workerAssets.parse(
        await client.invoke({ operation: "workerAssets", payload }),
      ),
    startExecution: async (payload) =>
      executionOutputSchemas.startExecution.parse(
        await client.invoke({ operation: "startExecution", payload }),
      ),
    appendEvent: async (payload) =>
      executionOutputSchemas.appendEvent.parse(
        await client.invoke({ operation: "appendEvent", payload }),
      ),
    createWorkerAsset: async (payload) =>
      executionOutputSchemas.createWorkerAsset.parse(
        await client.invoke({ operation: "createWorkerAsset", payload }),
      ),
    completeWorkerAsset: async (payload) =>
      executionOutputSchemas.completeWorkerAsset.parse(
        await client.invoke({ operation: "completeWorkerAsset", payload }),
      ),
    finishExecution: async (payload) =>
      executionOutputSchemas.finishExecution.parse(
        await client.invoke({ operation: "finishExecution", payload }),
      ),
    finish: async (payload) =>
      executionOutputSchemas.finish.parse(await client.invoke({ operation: "finish", payload })),
    finishWithRevision: async (payload) =>
      executionOutputSchemas.finishWithRevision.parse(
        await client.invoke({ operation: "finishWithRevision", payload }),
      ),
    interrupt: async (payload) =>
      executionOutputSchemas.interrupt.parse(
        await client.invoke({ operation: "interrupt", payload }),
      ),
    acknowledgeCommand: async (payload) =>
      executionOutputSchemas.acknowledgeCommand.parse(
        await client.invoke({ operation: "acknowledgeCommand", payload }),
      ),
  };
  const storage: Pick<ObjectStorage, "put" | "head" | "read"> = {
    put: async (input) =>
      executionObjectOutputSchemas.put.parse(
        await client.object({
          operation: "put",
          key: input.key,
          bytes: Buffer.from(input.body).toString("base64"),
        }),
      ),
    head: async (key) =>
      executionObjectOutputSchemas.head.parse(await client.object({ operation: "head", key })),
    read: async (key) => {
      const result = executionObjectOutputSchemas.read.parse(
        await client.object({ operation: "read", key }),
      );
      return result
        ? {
            metadata: result.metadata,
            body: (async function* () {
              yield Buffer.from(result.bytes, "base64");
            })(),
          }
        : null;
    },
  };
  return {
    client,
    app,
    storage,
    research: {
      search: async (query: string, signal?: AbortSignal) =>
        executionResearchOutputSchemas.search.parse(
          await client.research({ type: "search", query }, ...(signal ? [{ signal }] : [])),
        ),
      read: async (url: string, signal?: AbortSignal) =>
        executionResearchOutputSchemas.read.parse(
          await client.research({ type: "read", url }, ...(signal ? [{ signal }] : [])),
        ),
    },
  };
}
