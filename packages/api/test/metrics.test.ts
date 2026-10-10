import { createLogger } from "@raypx/logger";
import { expect, test } from "vite-plus/test";
import { withHttpRequest, type RequestObservation } from "../src/http.js";
import { createHttpMetrics } from "../src/metrics.js";

const observation = (changes: Partial<RequestObservation> = {}): RequestObservation => ({
  route: "/api/items/$id",
  method: "GET",
  status: 200,
  durationMs: 100,
  requestId: "private-request-id",
  ...changes,
});

test("exports cumulative Prometheus counters and seconds histograms", async () => {
  const metrics = createHttpMetrics({ routes: ["/api/items/$id"], bucketsSeconds: [0.1, 0.5] });
  metrics.observe(observation());
  metrics.observe(observation({ durationMs: 250 }));
  const text = metrics.exportPrometheus();
  const labels = 'route="/api/items/$id",method="GET",status="200"';
  expect(text).toContain(`raypx_http_requests_total{${labels}} 2\n`);
  expect(text).toContain(`raypx_http_request_duration_seconds_bucket{${labels},le="0.1"} 1\n`);
  expect(text).toContain(`raypx_http_request_duration_seconds_bucket{${labels},le="0.5"} 2\n`);
  expect(text).toContain(`raypx_http_request_duration_seconds_bucket{${labels},le="+Inf"} 2\n`);
  expect(text).toContain(`raypx_http_request_duration_seconds_sum{${labels}} 0.35\n`);
  expect(text).toContain(`raypx_http_request_duration_seconds_count{${labels}} 2\n`);
  const response = metrics.response();
  expect(response.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe(text);
});

test("bounds labels and never exports URLs, query values or request identities", () => {
  const metrics = createHttpMetrics({ routes: ["/api/items/$id"], bucketsSeconds: [1] });
  for (let id = 0; id < 1000; id++) {
    metrics.observe(
      observation({ route: `/users/private-${id}?token=secret-${id}`, method: `PRIVATE-${id}` }),
    );
  }
  const text = metrics.exportPrometheus();
  expect(text).toContain(
    'raypx_http_requests_total{route="unmatched",method="UNKNOWN",status="200"} 1000',
  );
  expect(text).not.toMatch(/private-|secret-|token|request-id|users/);
  expect(text.match(/^raypx_http_requests_total\{/gm)).toHaveLength(1);
  metrics.observe(observation({ status: -1 }));
  expect(metrics.exportPrometheus()).toContain('status="unknown"');
});

test("records concurrent requests once using a nested static route label", async () => {
  const metrics = createHttpMetrics({ routes: ["/api/items/$id"] });
  const logger = createLogger({ level: "silent" });
  await Promise.all(
    Array.from({ length: 20 }, (_, id) => {
      const request = new Request(`http://localhost/api/items/${id}?secret=private`);
      return withHttpRequest(
        request,
        () =>
          withHttpRequest(
            request,
            async () => {
              await Promise.resolve();
              return Response.json({ ok: true });
            },
            { route: "/api/items/$id" },
          ),
        { observe: metrics.observe, logger },
      );
    }),
  );
  expect(metrics.exportPrometheus()).toContain(
    'raypx_http_requests_total{route="/api/items/$id",method="GET",status="200"} 20',
  );
  expect(metrics.exportPrometheus()).not.toContain("secret");
});

test("validates registry configuration and ignores invalid durations", () => {
  for (const bucketsSeconds of [[], [0], [1, 1], [2, 1], [Infinity], [-1]])
    expect(() => createHttpMetrics({ routes: [], bucketsSeconds })).toThrow("buckets");
  expect(() => createHttpMetrics({ routes: ["line\nbreak"] })).toThrow("static route");
  expect(() =>
    createHttpMetrics({ routes: Array.from({ length: 101 }, (_, i) => String(i)) }),
  ).toThrow("static route");
  const metrics = createHttpMetrics({ routes: [] });
  for (const durationMs of [-1, NaN, Infinity]) metrics.observe(observation({ durationMs }));
  expect(metrics.exportPrometheus()).not.toContain('route="');
});

test("escapes explicit static labels for valid Prometheus exposition", () => {
  const route = 'label "quoted" \\ static';
  const metrics = createHttpMetrics({ routes: [route] });
  metrics.observe(observation({ route }));
  expect(metrics.exportPrometheus()).toContain('route="label \\"quoted\\" \\\\ static"');
});

test("exports terminal outcomes and total duration separately from response-ready metrics", () => {
  const metrics = createHttpMetrics({ routes: ["/api/items/$id"], bucketsSeconds: [0.1, 1] });
  metrics.observe(observation({ durationMs: 20 }));
  metrics.observeLifecycle({ ...observation({ durationMs: 20 }), phase: "response-ready" });
  for (const outcome of ["complete", "cancelled", "error"] as const) {
    metrics.observeLifecycle({
      ...observation({ durationMs: 500 }),
      phase: "response-finished",
      outcome,
    });
  }
  metrics.observeLifecycle({
    ...observation({ durationMs: 25, route: "/private/secret?token=sensitive" }),
    phase: "response-finished",
    outcome: "cancelled",
    status: null,
  });
  const output = metrics.exportPrometheus();
  expect(output).toContain(
    'raypx_http_requests_total{route="/api/items/$id",method="GET",status="200"} 1',
  );
  for (const outcome of ["complete", "cancelled", "error"]) {
    const labels = `route="/api/items/$id",method="GET",status="200",outcome="${outcome}"`;
    expect(output).toContain(`raypx_http_response_outcomes_total{${labels}} 1`);
    expect(output).toContain(`raypx_http_response_duration_seconds_sum{${labels}} 0.5`);
    expect(output).toContain(`raypx_http_response_duration_seconds_bucket{${labels},le="0.1"} 0`);
    expect(output).toContain(`raypx_http_response_duration_seconds_bucket{${labels},le="1"} 1`);
  }
  expect(output).toContain('status="unknown",outcome="cancelled"');
  expect(output).not.toMatch(/private|secret|sensitive|request-id/);
});
