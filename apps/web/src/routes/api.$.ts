import { createFileRoute } from "@tanstack/react-router";
import { apiNotFoundResponse } from "../server/health.server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: apiNotFoundResponse,
      POST: apiNotFoundResponse,
      PUT: apiNotFoundResponse,
      PATCH: apiNotFoundResponse,
      DELETE: apiNotFoundResponse,
      OPTIONS: apiNotFoundResponse,
      HEAD: apiNotFoundResponse,
    },
  },
});
