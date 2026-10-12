import * as Sentry from "@sentry/node";

/** Error text, request bodies and arbitrary SDK context are never sent. */
export function allowlistedErrorEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return {
    type: event.type,
    ...(event.event_id ? { event_id: event.event_id } : {}),
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
    level: event.level ?? "error",
    platform: "node",
    ...(event.release ? { release: event.release } : {}),
    ...(event.environment ? { environment: event.environment } : {}),
    exception: {
      values: (event.exception?.values ?? []).map((value) => ({
        type: value.type ?? "Error",
        value: "Service operation failed",
      })),
    },
    tags: { service: "api" },
  };
}

export function createErrorReporter(options: { dsn?: string; environment: string }) {
  if (options.dsn)
    Sentry.init({
      dsn: options.dsn,
      environment: options.environment,
      defaultIntegrations: false,
      integrations: [
        Sentry.onUncaughtExceptionIntegration(),
        Sentry.onUnhandledRejectionIntegration(),
      ],
      beforeSend: allowlistedErrorEvent,
      tracesSampleRate: 0.1,
      beforeSendTransaction(event) {
        const trace = event.contexts?.trace;
        return {
          ...(event.event_id ? { event_id: event.event_id } : {}),
          type: "transaction",
          transaction: "api operation",
          ...(event.timestamp ? { timestamp: event.timestamp } : {}),
          ...(event.start_timestamp ? { start_timestamp: event.start_timestamp } : {}),
          contexts: trace
            ? { trace: { trace_id: trace.trace_id, span_id: trace.span_id, op: "rpc.server" } }
            : {},
          spans: [],
          tags: { service: "api" },
        };
      },
    });
  return {
    trace<Result>(name: string, operation: () => Promise<Result>): Promise<Result> {
      if (!options.dsn) return operation();
      return Sentry.startSpan(
        { name: /^[a-zA-Z.]{1,120}$/.test(name) ? name : "api.operation", op: "rpc.server" },
        operation,
      );
    },
    report(error: unknown) {
      if (options.dsn) Sentry.captureException(error);
    },
    async close() {
      if (options.dsn) await Sentry.close(2000);
    },
  };
}
