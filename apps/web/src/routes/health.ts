import { createFileRoute } from "@tanstack/react-router";

/** Process liveness for deployments; it never calls the API. */
export const Route = createFileRoute("/health")({
  server: { handlers: { GET: () => Response.json({ status: "ok" }) } },
});
