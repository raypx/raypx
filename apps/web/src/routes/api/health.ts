import { createFileRoute } from "@tanstack/react-router";
import { RedisClient } from "bun";
import { env } from "../../env";
import { db } from "@raypx/database";
import * as schema from "@raypx/database/schema";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const timestamp = new Date().toISOString();
        let redisIsOk = false;
        try {
          const redis = new RedisClient(env.REDIS_URL);
          await redis.connect();
          await redis.ping();
          redisIsOk = true;
          redis.close();
        } catch (error) {
          console.error(error);
          redisIsOk = false;
        }
        const dbIsOk = await db.select().from(schema.user).limit(1).then(() => true).catch(() => false);
        return Response.json({
          status: "ok",
          timestamp,
          redis: redisIsOk,
          db: dbIsOk,
        });
      },
    },
  },
});
