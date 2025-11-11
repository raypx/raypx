import { auth } from "@raypx/auth/server";
import { createFileRoute } from "@tanstack/react-router";

const handler = async ({ request }: { request: Request }) => {
  return await auth.handler(request);
};

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});
