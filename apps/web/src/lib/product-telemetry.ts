import { env } from "../env";

export type ProductEvent =
  | "turn_sent"
  | "task_created"
  | "artifact_available"
  | "revision_accepted";
export type ProductProperties = {
  mode?: "search" | "computer";
  outcome?: "succeeded" | "failed" | "cancelled";
  artifactCount?: number;
};
const events = new Set<ProductEvent>([
  "turn_sent",
  "task_created",
  "artifact_available",
  "revision_accepted",
]);
export function allowedProductProperties(value: ProductProperties): ProductProperties {
  return {
    ...(value.mode === "search" || value.mode === "computer" ? { mode: value.mode } : {}),
    ...(["succeeded", "failed", "cancelled"].includes(value.outcome ?? "")
      ? { outcome: value.outcome }
      : {}),
    ...(Number.isSafeInteger(value.artifactCount) && (value.artifactCount ?? -1) >= 0
      ? { artifactCount: value.artifactCount }
      : {}),
  };
}
export function routeCategory(pathname: string): string {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/tasks")) return "task";
  if (pathname.startsWith("/projects")) return "project";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/admin")) return "admin";
  return "public";
}
/** Keep code locations from built static chunks, never resource URLs or stack context. */
export function allowedBrowserFrame(
  frame: { filename?: string; lineno?: number; colno?: number },
  origin: string,
) {
  try {
    if (!frame.filename) return null;
    const url = new URL(frame.filename, origin);
    if (url.origin !== origin || !/^\/assets\/[a-zA-Z0-9._-]+\.js$/.test(url.pathname)) return null;
    return {
      filename: url.pathname,
      ...(Number.isSafeInteger(frame.lineno) && (frame.lineno ?? 0) > 0
        ? { lineno: frame.lineno }
        : {}),
      ...(Number.isSafeInteger(frame.colno) && (frame.colno ?? -1) >= 0
        ? { colno: frame.colno }
        : {}),
    };
  } catch {
    return null;
  }
}
let analytics: { capture(event: string, properties: Record<string, unknown>): unknown } | null =
  null;
let initialization: Promise<void> | undefined;

/** Browser-only, optional adapters. No identity, prompt, resource URL or file content enters telemetry. */
export function initializeProductTelemetry(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  initialization ??= Promise.allSettled([
    env.VITE_POSTHOG_KEY
      ? import("posthog-js").then(({ default: posthog }) => {
          posthog.init(env.VITE_POSTHOG_KEY!, {
            ...(env.VITE_POSTHOG_HOST ? { api_host: env.VITE_POSTHOG_HOST } : {}),
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            disable_session_recording: true,
            disable_surveys: true,
            persistence: "memory",
            disable_cookie: true,
            respect_dnt: true,
            person_profiles: "never",
            advanced_disable_feature_flags: true,
            before_send(event) {
              if (!event || !events.has(event.event as ProductEvent)) return null;
              const source = event.properties;
              const mode =
                source.mode === "search" || source.mode === "computer" ? source.mode : undefined;
              const outcome =
                source.outcome === "succeeded" ||
                source.outcome === "failed" ||
                source.outcome === "cancelled"
                  ? source.outcome
                  : undefined;
              const artifactCount =
                typeof source.artifactCount === "number" ? source.artifactCount : undefined;
              return {
                ...event,
                properties: {
                  token: source.token,
                  distinct_id: source.distinct_id,
                  $process_person_profile: false,
                  ...allowedProductProperties({
                    ...(mode ? { mode } : {}),
                    ...(outcome ? { outcome } : {}),
                    ...(artifactCount !== undefined ? { artifactCount } : {}),
                  }),
                },
              };
            },
            property_blacklist: [
              "$current_url",
              "$pathname",
              "$initial_current_url",
              "$initial_pathname",
              "$referrer",
              "$referring_domain",
            ],
          });
          analytics = posthog;
        })
      : Promise.resolve(),
    env.VITE_SENTRY_DSN
      ? import("@sentry/react").then((sentry) => {
          sentry.init({
            dsn: env.VITE_SENTRY_DSN,
            defaultIntegrations: false,
            integrations: [sentry.browserTracingIntegration(), sentry.globalHandlersIntegration()],
            tracesSampleRate: 0.1,
            beforeBreadcrumb: () => null,
            beforeSend(event) {
              return {
                type: event.type,
                ...(event.event_id ? { event_id: event.event_id } : {}),
                ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
                ...(event.platform ? { platform: event.platform } : {}),
                ...(event.level ? { level: event.level } : {}),
                ...(event.environment ? { environment: event.environment } : {}),
                ...(event.release ? { release: event.release } : {}),
                tags: { surface: "web", route: routeCategory(window.location.pathname) },
                ...(event.exception?.values
                  ? {
                      exception: {
                        values: event.exception.values.map((value) => ({
                          ...(value.type ? { type: value.type } : {}),
                          value: "Application error",
                          ...(value.stacktrace?.frames
                            ? {
                                stacktrace: {
                                  frames: value.stacktrace.frames.flatMap((frame) => {
                                    const allowed = allowedBrowserFrame(
                                      frame,
                                      window.location.origin,
                                    );
                                    return allowed ? [allowed] : [];
                                  }),
                                },
                              }
                            : {}),
                        })),
                      },
                    }
                  : {}),
              };
            },
            beforeSendTransaction(event) {
              return {
                type: "transaction",
                ...(event.event_id ? { event_id: event.event_id } : {}),
                ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
                ...(event.start_timestamp !== undefined
                  ? { start_timestamp: event.start_timestamp }
                  : {}),
                transaction: routeCategory(window.location.pathname),
                ...(event.contexts?.trace
                  ? {
                      contexts: {
                        trace: {
                          trace_id: event.contexts.trace.trace_id,
                          span_id: event.contexts.trace.span_id,
                        },
                      },
                    }
                  : {}),
                spans: [],
                tags: { surface: "web" },
              };
            },
          });
        })
      : Promise.resolve(),
  ]).then(() => undefined);
  return initialization;
}
export function captureProductEvent(event: ProductEvent, properties: ProductProperties = {}): void {
  if (typeof window === "undefined" || !events.has(event)) return;
  void initializeProductTelemetry().then(() => {
    try {
      analytics?.capture(event, allowedProductProperties(properties));
    } catch {
      /* Telemetry never blocks product work. */
    }
  });
}
