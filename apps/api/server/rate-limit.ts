import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { rateLimit } from "@raypx/database/schema";

export interface RateRule {
  /** Window length in seconds. Keep it at or below Better Auth's longest window (60s),
   * which prunes older rows from the shared table. */
  window: number;
  max: number;
}
/** Resolves true when the request fits the rule and has been counted. */
export type RateLimiter = (key: string, rule: RateRule) => Promise<boolean>;

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
