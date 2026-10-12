import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import {
  executionGatewayContract,
  executionOperations,
} from "@voidmix/contracts/execution-gateway";
import type { CloudApplication } from "@voidmix/application";
import type { ObjectMetadata, ObjectStorage } from "@voidmix/core";

export function createExecutionClient(url: string, credential: string) {
  const client: ContractRouterClient<typeof executionGatewayContract> = createORPCClient(
    new RPCLink({
      url: "/internal/execution",
      origin: new URL(url).origin,
      headers: { authorization: `Bearer ${credential}` },
    }),
  );
  const app = Object.fromEntries(
    executionOperations.map((operation) => [
      operation,
      async (payload: Record<string, unknown>) => client.invoke({ operation, payload }),
    ]),
  ) as unknown as Pick<CloudApplication, (typeof executionOperations)[number]>;
  const forbidden = async (): Promise<never> => {
    throw new Error("Operation belongs to the trusted host.");
  };
  const executionApp = {
    ...app,
    claim: forbidden,
    heartbeat: forbidden,
    getConversation: forbidden,
    reserveUsage: forbidden,
    startUsage: forbidden,
    settleUsage: forbidden,
  };
  const storage: ObjectStorage = {
    put: async (input) =>
      (await client.object({
        operation: "put",
        key: input.key,
        bytes: Buffer.from(input.body).toString("base64"),
      })) as ObjectMetadata,
    head: async (key) => (await client.object({ operation: "head", key })) as ObjectMetadata | null,
    read: async (key) => {
      const result = (await client.object({ operation: "read", key })) as {
        metadata: ObjectMetadata;
        bytes: string;
      } | null;
      return result
        ? {
            metadata: result.metadata,
            body: (async function* () {
              yield Buffer.from(result.bytes, "base64");
            })(),
          }
        : null;
    },
    remove: forbidden,
    signUpload: forbidden,
    signDownload: forbidden,
  };
  return {
    client,
    app: executionApp,
    storage,
    research: {
      search: async (query: string, signal?: AbortSignal) =>
        (await client.research({ type: "search", query }, ...(signal ? [{ signal }] : []))) as {
          url: string;
          title: string;
          excerpt: string;
        }[],
      read: async (url: string, signal?: AbortSignal) =>
        (await client.research({ type: "read", url }, ...(signal ? [{ signal }] : []))) as {
          url: string;
          title: string;
          text: string;
        },
    },
  };
}
