import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouter } from "./routers/index";

export type { AppRouter, AppRouterClient } from "./routers/index";

export interface CreateClientOptions {
  baseUrl: string;
}

export function createRPCLink(options: CreateClientOptions) {
  return new RPCLink({
    url: `${options.baseUrl}/api/rpc`,
    fetch(url, fetchOptions) {
      return fetch(url, {
        ...fetchOptions,
        credentials: "include",
      });
    },
  });
}

export function createClient(options: CreateClientOptions): RouterClient<AppRouter> {
  const link = createRPCLink(options);
  return createORPCClient(link) as RouterClient<AppRouter>;
}

export function createQueryUtils(client: RouterClient<AppRouter>) {
  return createTanstackQueryUtils(client);
}
