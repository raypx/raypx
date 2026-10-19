import { EvlogHandlerPlugin } from "@orpc/evlog";
import type { LoggerRuntime } from "@voidmix/logger";

/** Only route templates enter diagnostics; URLs and query strings stay private. */
export function diagnosticRoute(path: string): string {
  if (path === "/health") return "/health";
  if (path.startsWith("/api/auth/")) return "/api/auth/*";
  if (path.startsWith("/rpc/")) return "/rpc/*";
  return "unmatched";
}

export function createRpcLoggingPlugin(logger: LoggerRuntime) {
  return new EvlogHandlerPlugin({
    // The runtime is silent; this is the only output path for RPC events.
    drain: logger.drain,
    enrich: ({ event }) => {
      event.operation = "rpc.request";
      event.route = "/rpc/*";
      // Unmatched RPC requests have no response in the handler plugin. Hono
      // supplies the 404; unexpected handler failures have an error instead.
      if (event.status === undefined) event.status = event.error ? 500 : 404;
    },
  });
}
