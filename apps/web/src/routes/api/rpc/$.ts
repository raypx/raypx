import { handleRPCRequest } from "@raypx/rpc/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleRPCRequest(request),
      POST: ({ request }) => handleRPCRequest(request),
    },
  },
});
