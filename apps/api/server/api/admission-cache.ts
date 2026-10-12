import { createRedisCache, type RedisCacheOptions } from "@raypx/cache";
import { logger } from "@raypx/shared/logger";

export async function connectAdmissionCache(
  options: RedisCacheOptions,
  connect = createRedisCache,
) {
  try {
    return await connect(options);
  } catch {
    const log = logger({ operation: "cloud.admission-cache" });
    log.set({ outcome: "unavailable" });
    log.warn("AI admission limiter unavailable; restart API after Redis recovery");
    log.emit();
    return undefined;
  }
}
