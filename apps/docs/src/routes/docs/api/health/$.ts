import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/api/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          status: "ok",
          timestamp: new Date().toISOString(),
        }),
    },
  },
});
