import { redis } from "@raypx/core";
import { db } from "@raypx/database";
import { user } from "@raypx/database/schema";
import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const getRedisHealth = createServerOnlyFn(async () => {
  const redisTimes: Record<string, number> = {};
  try {
    const start = performance.now();
    if (!redis.connected) {
      await redis.connect();
      redisTimes.connect = performance.now() - start;
    }
    const result = await redis.ping();
    redisTimes.ping = performance.now() - start;
    return {
      success: result === "PONG",
      times: redisTimes,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      times: redisTimes,
    };
  }
});

const getDbHealth = createServerOnlyFn(async () => {
  const dbTimes: Record<string, number> = {};
  try {
    const start = performance.now();
    dbTimes.connect = performance.now() - start;
    await db.select().from(user).limit(1);
    dbTimes.query = performance.now() - start;
    return {
      success: true,
      times: dbTimes,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      times: dbTimes,
    };
  }
});

const getHealth = createServerOnlyFn(async () => {
  try {
    const [redisHealth, dbHealth] = await Promise.all([getRedisHealth(), getDbHealth()]);
    return {
      redis: redisHealth.success,
      db: dbHealth.success,
      redisTimes: redisHealth.times,
      dbTimes: dbHealth.times,
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
