import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health2")({
  server: {
    handlers: {
      GET: async () => {
        const timestamp = new Date().toISOString();
        return Response.json({
          status: "ok",
          timestamp,
        });
      },
    },
  },
});
