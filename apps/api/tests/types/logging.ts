import type { ApiLogging } from "../../server/logging.js";

/** Checked by the API's strict type gate; never emits a runtime event. */
function assertEventTypes(logging: ApiLogging) {
  const http = logging.createLogger({
    operation: "http.request",
    requestId: "req_example",
    method: "GET",
    route: "/health",
  });
  http.emit({ status: 200 });
  // @ts-expect-error Status is numeric.
  http.emit({ status: "200" });
  // @ts-expect-error Private fields are outside the application event schema.
  http.set({ password: "private" });
  // @ts-expect-error HTTP events cannot carry Job fields.
  http.emit({ job: { name: "maintenance:cleanup" } });
  // @ts-expect-error Requests require correlation and route metadata.
  logging.createLogger({ operation: "http.request" });
  // @ts-expect-error Operations are explicit application categories.
  logging.createLogger({ operation: "unknown.operation" });
  const job = logging.createLogger({ operation: "job.schedules" });
  job.emit({
    job: {
      name: "schedules:tick",
      status: "completed",
      claimed: "1",
      reconciled: "0",
      failed: "0",
    },
  });
  // @ts-expect-error A schedule event cannot acquire cleanup counters.
  job.emit({ job: { name: "schedules:tick", sessions: "1" } });
}
void assertEventTypes;
