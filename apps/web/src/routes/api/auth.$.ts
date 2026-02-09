import { auth } from "@raypx/auth/server";
import { createFileRoute } from "@tanstack/react-router";

const handler = ({ request }: { request: Request }) => auth.handler(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});
