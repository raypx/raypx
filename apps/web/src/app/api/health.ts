import { db, schemas } from "@raypx/db";
import { m } from "@raypx/i18n/messages";
import "@raypx/i18n/types";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        // const res = await db.select().from(schemas.user);
        console.log(JSON.stringify(m));
        return json({
          data: "OK",
          // res,
        });
      },
    },
  },
});
