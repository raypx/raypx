import { createFileRoute } from "@tanstack/react-router";
import { readinessResponse } from "../server/health.server";

export const Route = createFileRoute("/api/ready")({
  server: { handlers: { GET: readinessResponse } },
});
