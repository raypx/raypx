import { EvlogHandlerPlugin } from "@orpc/evlog";
import { createLogger, initLogger, type DrainContext } from "@raypx-kit/logger";
import { createDrainPipeline } from "@raypx-kit/logger/pipeline";
import { withEventPolicy, type SafeDrain, type SafeEvent } from "@raypx-kit/logger/safe";

/** The only top-level fields an API event may carry; everything else is dropped. */
export const API_LOG_FIELDS = [
  "operation",
  "requestId",
  "method",
  "route",
  "status",
  "code",
  "durationMs",
  "error",
  "rpc",
] as const;

export interface ApiLogging {
  createLogger: typeof createLogger;
  /** Policy boundary for framework drains; raw events never reach the sink. */
  drain(context: DrainContext): void;
  /** Waits for buffered events; rejects if any were dropped or failed. */
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface ApiLoggingOptions {
  service?: string;
  environment: string;
  sink: SafeDrain & { flush?(): Promise<void>; close?(): Promise<void> };
}

/**
 * Configures evlog once for this process. Events pass the field policy, then a
 * bounded pipeline, so responses never wait for log delivery.
 */
export function createApiLogging({
  service = "raypx-api",
  environment,
  sink,
}: ApiLoggingOptions): ApiLogging {
  let failed = false;
  let closing: Promise<void> | undefined;
  const pipeline = createDrainPipeline<{ event: SafeEvent }>({
    batch: { size: 50, intervalMs: 1000 },
    retry: { maxAttempts: 1 },
    maxBufferSize: 1024,
    onDropped: () => {
      failed = true;
    },
  })(async (batch) => {
    for (const context of batch) await sink(context);
  });
  const drain = withEventPolicy(pipeline, {
    fields: API_LOG_FIELDS,
    shapes: { rpc: ["system", "method"] },
  });
  initLogger({
    env: { service, environment },
    silent: true,
    pretty: false,
    redact: true,
    drain,
  });
  async function flush() {
    await pipeline.flush();
    try {
      await sink.flush?.();
    } catch {
      failed = true;
    }
    if (failed) {
      failed = false;
      throw new Error("Logger drain failed");
    }
  }
  return {
    createLogger,
    drain: (context) => void drain(context),
    flush,
    close: () =>
      (closing ??= (async () => {
        try {
          await flush();
        } finally {
          await sink.close?.();
        }
      })()),
  };
}

/** Only route templates enter diagnostics; URLs and query strings stay private. */
export function diagnosticRoute(path: string): string {
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
