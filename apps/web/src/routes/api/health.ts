import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const getHealth = createServerOnlyFn(async () => {
  try {
    const redis = await import("@raypx/core").then((m) => m.redis);
    const db = await import("@raypx/database").then((m) => m.db);
    const schema = await import("@raypx/database/schema");
    return {
      redis: await redis
        .connect()
        .then(() => true)
        .catch(() => false),
      db: await db
        .select()
        .from(schema.user)
        .limit(1)
        .then(() => true)
        .catch(() => false),
    };
  } catch (error) {
    console.error(error);
    return {
      redis: false,
      db: false,
    };
  }
});

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const timestamp = new Date().toISOString();
        const { redis, db } = await getHealth();
        return Response.json({
          status: "ok",
          timestamp,
          redis,
          db,
        });
      },
    },
  },
});
