import type { SafeEvent } from "@raypx/logger/safe";
import { createManagedDrain, type ManagedSink, type DrainStats } from "@raypx/logger/managed";

export interface ErrorReportOptions {
  /** PostHog project token and ingestion host, the same project as browser reports. */
  token: string;
  host: string;
  environment: string;
  service?: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Queued plus active reports (default 16). Overflow never drops the primary log. */
  maxPending?: number;
  concurrency?: number;
}

type Sink = ManagedSink;
export type ErrorReportSink = Sink & { reportStats(): DrainStats };

/**
 * Sends error events to PostHog error tracking after the logging field policy ran,
 * so reports carry only the operation, route, status, safe error name/code and the
 * request ID that also appears in the logs and API error responses.
 */
export function withErrorReports(sink: Sink, options: ErrorReportOptions): ErrorReportSink {
  const send = options.fetch ?? globalThis.fetch;
  const url = `${options.host.replace(/\/$/, "")}/i/v0/e/`;
  const report = async (event: SafeEvent) => {
    const error = typeof event.error === "object" && event.error ? event.error : {};
    const name =
      typeof (error as { name?: unknown }).name === "string"
        ? (error as { name: string }).name
        : "Error";
    const code = typeof event.code === "string" ? event.code : (error as { code?: unknown }).code;
    const response = await send(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: options.token,
        event: "$exception",
        distinct_id: options.service ?? event.service,
        timestamp: event.timestamp,
        properties: {
          $exception_list: [
            {
              type: name,
              value: typeof code === "string" ? code : name,
              mechanism: { handled: true, synthetic: true },
            },
          ],
          $process_person_profile: false,
          environment: options.environment,
          service: event.service,
          operation: event.operation,
          route: event.route,
          status: event.status,
          requestId: event.requestId,
        },
      }),
      signal: AbortSignal.timeout(2000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Error report delivery failed");
  };
  const reports = createManagedDrain({
    policy: { fields: ["operation", "route", "status", "requestId", "code", "error"] },
    sink: ({ event }) => report(event),
    concurrency: options.concurrency ?? 4,
    maxPending: options.maxPending ?? 16,
  });
  const bestEffort = async (complete: () => Promise<void>) => {
    try {
      await complete();
    } catch {
      // Statistics retain loss; reporting never changes primary log delivery.
    }
  };
  let closing: Promise<void> | undefined;
  const isError = (event: SafeEvent) =>
    event.level === "error" || (typeof event.status === "number" && event.status >= 500);
  return Object.assign(
    async (context: { event: SafeEvent }) => {
      if (isError(context.event)) {
        reports(context);
      }
      await sink(context);
    },
    {
      flush: async () => {
        await bestEffort(() => reports.flush());
        await sink.flush?.();
      },
      close: () =>
        (closing ??= (async () => {
          await bestEffort(() => reports.close());
          await sink.close?.();
        })()),
      reportStats: () => reports.stats(),
    },
  );
}

/** Wraps a log sink with PostHog error reports when the API has a project configured. */
export function errorReports(
  environment: {
    NODE_ENV: string;
    POSTHOG_PROJECT_TOKEN?: string | undefined;
    POSTHOG_HOST?: string | undefined;
  },
  sink: Sink,
): Sink {
  return environment.POSTHOG_PROJECT_TOKEN && environment.POSTHOG_HOST
    ? withErrorReports(sink, {
        token: environment.POSTHOG_PROJECT_TOKEN,
        host: environment.POSTHOG_HOST,
        environment: environment.NODE_ENV,
      })
    : sink;
}
