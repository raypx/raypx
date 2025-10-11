import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const auth = params._splat?.split("/");
        return json({
          data: {
            url: request.url,
            method: request.method,
            params: {
              auth,
            },
          },
        });
      },
    },
  },
});
