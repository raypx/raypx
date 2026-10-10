import { createFileRoute } from "@tanstack/react-router";
import { metricsResponse } from "../server/metrics.server";

export const Route = createFileRoute("/api/metrics")({
  server: { handlers: { GET: metricsResponse } },
});
