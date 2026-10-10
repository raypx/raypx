import type { RequestObservation, RequestLifecycleEvent } from "./http.js";

export interface HttpMetricsOptions {
  /** Closed set of static route templates. Everything else becomes unmatched. */
  routes: readonly string[];
  /** Finite, strictly increasing duration boundaries in seconds. */
  bucketsSeconds?: readonly number[];
}

export interface HttpMetrics {
  /** Compatible with HttpOptions.observe; ignores request IDs and URLs. */
  observe: (observation: RequestObservation) => void;
  /** Records only terminal lifecycle events, retaining the original response status. */
  observeLifecycle: (event: RequestLifecycleEvent) => void;
  exportPrometheus: () => string;
  /** The application decides whether and how this response is exposed. */
  response: () => Response;
}

interface Series {
  route: string;
  method: string;
  status: string;
  count: number;
  seconds: number;
  buckets: number[];
  outcome?: "complete" | "cancelled" | "error";
}

const methods = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "CONNECT",
  "TRACE",
]);
const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const escapeLabel = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

/**
 * Creates process-local counters and latency histograms without an exporter service.
 * Labels have a closed route/method/status space; raw path, query and identity data
 * are never read. Create once per server process, then attach observe to the boundary.
 */
export function createHttpMetrics(options: HttpMetricsOptions): HttpMetrics {
  const routes = new Set(options.routes);
  if (routes.size > 100 || [...routes].some((route) => !/^[\x20-\x7e]{1,128}$/.test(route)))
    throw new Error(
      "Metrics require at most 100 printable static route labels of 1-128 characters",
    );
  const boundaries = [...(options.bucketsSeconds ?? defaultBuckets)];
  if (
    boundaries.length < 1 ||
    boundaries.length > 30 ||
    boundaries.some(
      (value, index) =>
        !Number.isFinite(value) ||
        value <= 0 ||
        (index > 0 && value <= (boundaries[index - 1] ?? 0)),
    )
  )
    throw new Error("Metrics buckets must be finite, positive and strictly increasing");
  const series = new Map<string, Series>();
  const terminalSeries = new Map<string, Series>();

  function record(
    registry: Map<string, Series>,
    observation: Omit<RequestObservation, "status"> & { status: number | null },
    outcome?: Series["outcome"],
  ) {
    if (!Number.isFinite(observation.durationMs) || observation.durationMs < 0) return;
    const route = routes.has(observation.route) ? observation.route : "unmatched";
    const method = methods.has(observation.method) ? observation.method : "UNKNOWN";
    const status =
      observation.status !== null &&
      Number.isInteger(observation.status) &&
      observation.status >= 100 &&
      observation.status <= 599
        ? String(observation.status)
        : "unknown";
    const key = JSON.stringify([route, method, status, outcome]);
    let entry = registry.get(key);
    if (!entry) {
      entry = {
        route,
        method,
        status,
        outcome,
        count: 0,
        seconds: 0,
        buckets: boundaries.map(() => 0),
      };
      registry.set(key, entry);
    }
    const seconds = observation.durationMs / 1000;
    entry.count++;
    entry.seconds += seconds;
    boundaries.forEach((boundary, index) => {
      if (seconds <= boundary) entry.buckets[index] = (entry.buckets[index] ?? 0) + 1;
    });
  }

  const exportPrometheus = (): string => {
    const lines = [
      "# HELP raypx_http_requests_total Prepared HTTP responses (handler completion).",
      "# TYPE raypx_http_requests_total counter",
      "# HELP raypx_http_request_duration_seconds Time to prepared response in seconds.",
      "# TYPE raypx_http_request_duration_seconds histogram",
    ];
    const append = (registry: Map<string, Series>, counter: string, histogram: string) => {
      for (const entry of [...registry.values()].sort((a, b) =>
        `${a.route}:${a.method}:${a.status}:${a.outcome ?? ""}`.localeCompare(
          `${b.route}:${b.method}:${b.status}:${b.outcome ?? ""}`,
        ),
      )) {
        const labels = `route="${escapeLabel(entry.route)}",method="${entry.method}",status="${entry.status}"${entry.outcome ? `,outcome="${entry.outcome}"` : ""}`;
        lines.push(`${counter}{${labels}} ${entry.count}`);
        boundaries.forEach((boundary, index) => {
          lines.push(
            `${histogram}_bucket{${labels},le="${boundary}"} ${entry.buckets[index] ?? 0}`,
          );
        });
        lines.push(
          `${histogram}_bucket{${labels},le="+Inf"} ${entry.count}`,
          `${histogram}_sum{${labels}} ${entry.seconds}`,
          `${histogram}_count{${labels}} ${entry.count}`,
        );
      }
    };
    append(series, "raypx_http_requests_total", "raypx_http_request_duration_seconds");
    lines.push(
      "# HELP raypx_http_response_outcomes_total Terminal response stream outcomes.",
      "# TYPE raypx_http_response_outcomes_total counter",
      "# HELP raypx_http_response_duration_seconds Request entry to response stream termination in seconds.",
      "# TYPE raypx_http_response_duration_seconds histogram",
    );
    append(
      terminalSeries,
      "raypx_http_response_outcomes_total",
      "raypx_http_response_duration_seconds",
    );
    return `${lines.join("\n")}\n`;
  };

  return {
    observe(observation) {
      record(series, observation);
    },
    observeLifecycle(event) {
      if (
        event.phase !== "response-finished" ||
        !["complete", "cancelled", "error"].includes(event.outcome)
      )
        return;
      record(terminalSeries, event, event.outcome);
    },
    exportPrometheus,
    response: () =>
      new Response(exportPrometheus(), {
        headers: {
          "content-type": "text/plain; version=0.0.4; charset=utf-8",
          "cache-control": "no-store",
        },
      }),
  };
}
