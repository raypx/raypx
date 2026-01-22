import { createClient } from "redis";
import { env } from "./env";

// Create a Redis client
const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));

export const redis = redisClient;
