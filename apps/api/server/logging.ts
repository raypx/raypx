import { EvlogHandlerPlugin } from "@orpc/evlog";
import { createLogger, initLogger, type DrainContext } from "@raypx/logger";
import { createManagedDrain, type ManagedSink, type DrainStats } from "@raypx/logger/managed";
import { apiEventPolicy } from "./logging/policy.js";
import type { CreateApiEvent, DiagnosticRoute } from "./logging/events.js";
export { API_LOG_FIELDS } from "./logging/policy.js";
export type { ApiEventLogger } from "./logging/events.js";

export interface ApiLogging {
  createLogger: CreateApiEvent;
  /** Policy boundary for framework drains; raw events never reach the sink. */
  drain(context: DrainContext): void;
  /** Waits for buffered events; rejects if any were dropped or failed. */
  flush(): Promise<void>;
  close(): Promise<void>;
  stats(): DrainStats;
}

export interface ApiLoggingOptions {
  service?: string;
  environment: string;
  sink: ManagedSink;
}

/**
 * Configures evlog once for this process. Events pass the field policy, then a
 * bounded managed queue, so responses never wait for log delivery.
 */
export function createApiLogging({
  service = "raypx-api",
  environment,
  sink,
}: ApiLoggingOptions): ApiLogging {
  const drain = createManagedDrain({ policy: apiEventPolicy, sink });
  initLogger({
    env: { service, environment },
    silent: true,
    pretty: false,
    redact: true,
    drain,
  });
  return {
    createLogger: (fields) => {
      const logger = createLogger({ ...fields });
      return {
        set: (value) => logger.set(value),
        emit: (value) => {
          logger.emit(value);
        },
        error: (error) => logger.error(error),
      };
    },
    drain: (context) => drain(context),
    flush: () => drain.flush(),
    close: () => drain.close(),
    stats: () => drain.stats(),
  };
}

/** Only route templates enter diagnostics; URLs and query strings stay private. */
export function diagnosticRoute(path: string): DiagnosticRoute {
  if (path === "/health" || path === "/ready") return path;
  if (path.startsWith("/api/auth/")) return "/api/auth/*";
  if (path.startsWith("/rpc/")) return "/rpc/*";
  return "unmatched";
}

export function createRpcLoggingPlugin(logging: ApiLogging) {
  return new EvlogHandlerPlugin({
    // The logger is silent; this is the only output path for RPC events.
    drain: (context) => logging.drain(context),
    enrich: ({ event }) => {
      event.operation = "rpc.request";
      event.route = "/rpc/*";
      // Unmatched RPC requests have no response in the handler plugin. Hono
      // supplies the 404; unexpected handler failures have an error instead.
      if (event.status === undefined) event.status = event.error ? 500 : 404;
    },
  });
}
