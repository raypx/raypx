import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { createContext } from "./context";
import { appRouter } from "./routers";

const getORPCClient = createIsomorphicFn()
  .server(() => {
    return createRouterClient(appRouter, {
      context: async (ctx) => createContext({ req: ctx.request }),
    });
  })
  .client((): RouterClient<typeof appRouter> => {
    const link = new RPCLink({
      url: `${window.location.origin}/api/rpc`,
      fetch(request, init, _options, _path, _input) {
        return fetch(request, {
          ...init,
          credentials: "include",
        });
      },
    });

    return createORPCClient(link);
  });

export const client: RouterClient<typeof appRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);

export type ORPC = typeof orpc;
