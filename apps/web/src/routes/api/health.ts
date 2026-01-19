import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const getHealth = createServerOnlyFn(async () => {
  try {
    const redisTimes: Record<string, number> = {}
    const dbTimes: Record<string, number> = {}
    const getRedisHealth = async () => {
      try {
        let start = performance.now();
        const redis = await import("@raypx/core").then((m) => m.redis);
        redisTimes["import"] = performance.now() - start;
        await redis.connect();
        redisTimes["connect"] = performance.now() - start;
        const result = await redis.ping();
        redisTimes["ping"] = performance.now() - start;
        redis.close();
        redisTimes["close"] = performance.now() - start;
        return result === "PONG";
      } catch (error) {
        console.error(error);
        return false;
      }
    };

    const getDbHealth = async () => {
      try {
        let start = performance.now();
        const [db, schema] = await Promise.all([
          import("@raypx/database").then((m) => m.db),
          import("@raypx/database/schema"),
        ]);
        dbTimes["import"] = performance.now() - start;
        await db.select().from(schema.user).limit(1);
        dbTimes["query"] = performance.now() - start;
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    };
    const [redisHealth, dbHealth] = await Promise.all([getRedisHealth(), getDbHealth()]);

    return {
      redis: redisHealth,
      db: dbHealth,
      redisTimes,
      dbTimes,
    };
  } catch (error) {
    console.error(error);
    return {
      redis: false,
      db: false,
      redisTimes: [],
      dbTimes: [],
    };
  }
});

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const timestamp = new Date().toISOString();
        const result = await getHealth();
        return Response.json({
          status: "ok",
          timestamp,
          ...result,
        });
      },
    },
  },
});
