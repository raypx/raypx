import { redis } from "@raypx/core";
import { db } from "@raypx/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getRedisHealth() {
  const redisTimes: Record<string, number> = {};
  try {
    const start = performance.now();
    if (!redis.isReady) {
      await redis.connect();
    }
    redisTimes.connect = performance.now() - start;
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
}

async function getDbHealth() {
  const dbTimes: Record<string, number> = {};
  try {
    const start = performance.now();
    dbTimes.connect = performance.now() - start;
    await db.user.findFirst({ take: 1 });
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
}

export async function GET() {
  try {
    const [redisHealth, dbHealth] = await Promise.all([getRedisHealth(), getDbHealth()]);
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      redis: redisHealth.success,
      db: dbHealth.success,
      redisTimes: redisHealth.times,
      dbTimes: dbHealth.times,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      status: "error",
      timestamp: new Date().toISOString(),
      redis: false,
      db: false,
      redisTimes: {},
      dbTimes: {},
    });
  }
}
