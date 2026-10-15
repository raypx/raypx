import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { apiContract } from "@raypx/contracts/api";

export type ApiClient = ContractRouterClient<typeof apiContract>;
export type ApiHeaders = Record<string, string | undefined>;
export type FetchCallable = (input: string, init?: RequestInit) => Promise<Response>;
export interface CreateApiClientOptions {
  baseUrl?: string;
  headers?: ApiHeaders | (() => ApiHeaders | Promise<ApiHeaders>);
  fetch?: FetchCallable;
}

/** Credential providers are evaluated for each call, including native cookies. */
export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
  const link = new RPCLink({
    url: "/rpc",
    ...(options.baseUrl ? { origin: options.baseUrl.replace(/\/$/, "") } : {}),
    method: "POST",
    headers: async () => {
      const values =
        typeof options.headers === "function" ? await options.headers() : options.headers;
      return Object.fromEntries(
        Object.entries(values ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    },
    fetch: (input, init) =>
      (options.fetch ?? globalThis.fetch)(input, { ...init, credentials: "include" }),
  });
  return createORPCClient(link);
}
