import { RPCHandler } from "@orpc/server/fetch";
import { createContext } from "./context";
import { appRouter } from "./routers/index";

export { type Context, createContext } from "./context";
export { type AppRouter, type AppRouterClient, appRouter } from "./routers/index";

const handler = new RPCHandler(appRouter);

export async function handleRPCRequest(request: Request): Promise<Response> {
  const context = await createContext({ request });

  const { matched, response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context,
  });

  if (matched) {
    return response;
  }

  return new Response("Not Found", { status: 404 });
}
