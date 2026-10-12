import * as Sentry from "@sentry/node";

export function startWorkerTelemetry(dsn?: string): {
  capture(code: string, runId?: string): void;
  trace<T>(runId: string, operation: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
} {
  if (dsn)
    Sentry.init({
      dsn,
      defaultIntegrations: false,
      tracesSampleRate: 0.05,
      beforeSend(event) {
        return {
          type: undefined,
          ...(event.event_id ? { event_id: event.event_id } : {}),
          ...(event.timestamp ? { timestamp: event.timestamp } : {}),
          platform: "node",
          ...(event.level ? { level: event.level } : {}),
          tags: {
            service: "voidmix-worker",
            ...(event.tags?.runId ? { runId: event.tags.runId } : {}),
            ...(event.tags?.errorCode ? { errorCode: event.tags.errorCode } : {}),
          },
          exception: { values: [{ type: "WorkerError", value: "Worker operation failed." }] },
        };
      },
      beforeSendTransaction(event) {
        const trace = event.contexts?.trace;
        return {
          type: "transaction",
          transaction: "cloud.run",
          ...(event.event_id ? { event_id: event.event_id } : {}),
          ...(event.start_timestamp ? { start_timestamp: event.start_timestamp } : {}),
          ...(event.timestamp ? { timestamp: event.timestamp } : {}),
          contexts: trace
            ? {
                trace: {
                  trace_id: trace.trace_id,
                  span_id: trace.span_id,
                  op: "voidmix.run",
                  ...(trace.status ? { status: trace.status } : {}),
                },
              }
            : {},
          tags: {
            service: "voidmix-worker",
            ...(event.tags?.runId ? { runId: event.tags.runId } : {}),
          },
          spans: [],
        };
      },
    });
  return {
    capture(code, runId) {
      if (dsn)
        Sentry.captureException(new Error("Worker operation failed."), {
          tags: { errorCode: code, ...(runId ? { runId } : {}) },
        });
    },
    async trace(runId, operation) {
      if (!dsn) return operation();
      return Sentry.withIsolationScope(async (scope) => {
        scope.setTag("runId", runId);
        return Sentry.startNewTrace(() =>
          Sentry.startSpan({ name: "cloud.run", op: "voidmix.run" }, operation),
        );
      });
    },
    async close() {
      if (dsn) await Sentry.close(2000);
    },
  };
}
