import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { rateLimit } from "@raypx/database/schema";

import type { RateLimiter } from "./rate-limit/types.js";

/**
 * One atomic upsert per check, with Better Auth's semantics: a request outside the
 * window restarts the count; a full window is rejected without moving its start.
 * A rejected row holds max + 1, so the returned count alone decides the result even
 * when concurrent requests share a millisecond.
 */
export function createRateLimiter(db: Database, now: () => number = Date.now): RateLimiter {
  return async (key, rule) => {
    const time = now();
    const windowStart = time - rule.window * 1000;
    const expired = sql`${rateLimit.lastRequest} <= ${windowStart}`;
    const [row] = await db
      .insert(rateLimit)
      .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: time })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          count: sql`case when ${expired} then 1 when ${rateLimit.count} >= ${rule.max} then ${rule.max + 1} else ${rateLimit.count} + 1 end`,
          lastRequest: sql`case when ${expired} or ${rateLimit.count} < ${rule.max} then ${time} else ${rateLimit.lastRequest} end`,
        },
      })
      .returning({ count: rateLimit.count });
    return row !== undefined && row.count <= rule.max;
  };
}

/**
 * Process-local limiter with the same window semantics, for development: the limited
 * paths run on every local request instead of first in production. Never use it for a
 * deployment, since each process would count alone.
 */
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; lastRequest: number }>();
  let pruned = now();
  return async (key, rule) => {
    const time = now();
    // Windows never exceed 60 s; drop idle keys once a minute so the map stays bounded.
    if (time - pruned >= 60_000) {
      pruned = time;
      for (const [stale, entry] of windows)
        if (time - entry.lastRequest >= 60_000) windows.delete(stale);
    }
    const entry = windows.get(key);
    if (!entry || entry.lastRequest <= time - rule.window * 1000) {
      windows.set(key, { count: 1, lastRequest: time });
      return true;
    }
    if (entry.count >= rule.max) return false;
    entry.count += 1;
    entry.lastRequest = time;
    return true;
  };
}
