import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "@raypx/prisma";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const r = await prisma.user.findFirst();
        if (!r) {
          return new Response("Not found", { status: 404 });
        }
        return new Response("OK", { status: 200 });
      },
    },
  },
});
