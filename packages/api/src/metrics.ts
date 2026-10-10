import type { RequestObservation } from "./http.js";

export interface HttpMetricsOptions {
  /** Closed set of static route templates. Everything else becomes unmatched. */
  routes: readonly string[];
  /** Finite, strictly increasing duration boundaries in seconds. */
  bucketsSeconds?: readonly number[];
}

export interface HttpMetrics {
  /** Compatible with HttpOptions.observe; ignores request IDs and URLs. */
  observe: (observation: RequestObservation) => void;
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

  const exportPrometheus = (): string => {
    const lines = [
      "# HELP raypx_http_requests_total Completed HTTP requests.",
      "# TYPE raypx_http_requests_total counter",
      "# HELP raypx_http_request_duration_seconds HTTP request duration in seconds.",
      "# TYPE raypx_http_request_duration_seconds histogram",
    ];
    for (const entry of [...series.values()].sort((a, b) =>
      `${a.route}:${a.method}:${a.status}`.localeCompare(`${b.route}:${b.method}:${b.status}`),
    )) {
      const labels = `route="${escapeLabel(entry.route)}",method="${entry.method}",status="${entry.status}"`;
      lines.push(`raypx_http_requests_total{${labels}} ${entry.count}`);
      boundaries.forEach((boundary, index) => {
        lines.push(
          `raypx_http_request_duration_seconds_bucket{${labels},le="${boundary}"} ${entry.buckets[index] ?? 0}`,
        );
      });
      lines.push(
        `raypx_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${entry.count}`,
        `raypx_http_request_duration_seconds_sum{${labels}} ${entry.seconds}`,
        `raypx_http_request_duration_seconds_count{${labels}} ${entry.count}`,
      );
    }
    return `${lines.join("\n")}\n`;
  };

  return {
    observe(observation) {
      if (!Number.isFinite(observation.durationMs) || observation.durationMs < 0) return;
      const route = routes.has(observation.route) ? observation.route : "unmatched";
      const method = methods.has(observation.method) ? observation.method : "UNKNOWN";
      const status =
        Number.isInteger(observation.status) &&
        observation.status >= 100 &&
        observation.status <= 599
          ? String(observation.status)
          : "unknown";
      const key = JSON.stringify([route, method, status]);
      let entry = series.get(key);
      if (!entry) {
        entry = { route, method, status, count: 0, seconds: 0, buckets: boundaries.map(() => 0) };
        series.set(key, entry);
      }
      const seconds = observation.durationMs / 1000;
      entry.count++;
      entry.seconds += seconds;
      boundaries.forEach((boundary, index) => {
        if (seconds <= boundary) entry.buckets[index] = (entry.buckets[index] ?? 0) + 1;
      });
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
