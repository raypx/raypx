import { createAuth } from "@raypx/auth/server";
import { createFileRoute } from "@tanstack/react-router";

const handler = async ({ request }: { request: Request }) => {
  const auth = await createAuth();
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
