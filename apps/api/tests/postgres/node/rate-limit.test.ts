import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { like } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth } from "@raypx/auth/server";
import { rateLimit, schema } from "@raypx/database/schema";
import { createRateLimiter } from "../../../server/rate-limit.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const prefix = `test:${crypto.randomUUID()}`;
beforeAll(() => migrateDatabase(url));
afterAll(async () => {
  await connection.db.delete(rateLimit).where(like(rateLimit.key, `${prefix}%`));
  await connection.close();
});

it("counts within a window, rejects at the limit and restarts after the window", async () => {
  let now = 1_000_000;
  const limit = createRateLimiter(connection.db, () => now);
  const rule = { window: 10, max: 2 };
  const key = `${prefix}:window`;
  expect(await limit(key, rule)).toBe(true);
  now += 1000;
  expect(await limit(key, rule)).toBe(true);
  now += 1000;
  expect(await limit(key, rule)).toBe(false);
  now += 10_000;
  expect(await limit(key, rule)).toBe(true);
});

it("admits exactly the limit under concurrent requests", async () => {
  const limit = createRateLimiter(connection.db);
  const key = `${prefix}:concurrent`;
  const results = await Promise.all(
    Array.from({ length: 8 }, () => limit(key, { window: 60, max: 3 })),
  );
  expect(results.filter(Boolean)).toHaveLength(3);
});

it("shares Better Auth sign-in limits through the database by trusted client IP", async () => {
  const auth = createAuth({
    database: drizzleAdapter(connection.db, { provider: "pg", schema }),
    mailer: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
    config: {
      baseURL: "https://api.example.com",
      secret: "rate-limit-test-secret-of-at-least-32-chars",
      trustedOrigins: [],
      production: true,
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  });
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await auth.handler(
      new Request("https://api.example.com/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://api.example.com",
          "cf-connecting-ip": ip,
        },
        body: JSON.stringify({ email: "missing@example.com", password: "incorrect-password" }),
      }),
    );
    statuses.push(response.status);
  }
  // Better Auth allows three sign-in attempts per ten seconds for one client IP.
  expect(statuses.slice(0, 3)).not.toContain(429);
  expect(statuses[3]).toBe(429);
  await connection.db.delete(rateLimit).where(like(rateLimit.key, `%${ip}%`));
});
