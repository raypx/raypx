import { db, schemas } from "@raypx/db";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const res = await db.select().from(schemas.user);
        return json({
          data: "OK",
          res,
        });
      },
    },
  },
});
