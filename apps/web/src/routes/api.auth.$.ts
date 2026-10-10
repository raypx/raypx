import { createFileRoute } from "@tanstack/react-router";
import { authResponse } from "../server/account.server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: authResponse,
      POST: authResponse,
      PUT: authResponse,
      PATCH: authResponse,
      DELETE: authResponse,
      OPTIONS: authResponse,
      HEAD: authResponse,
    },
  },
});
