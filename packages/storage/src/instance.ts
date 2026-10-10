import { createStorage as createUnstorage } from "unstorage";
import type { BuiltinDriverOptions, Driver, Storage } from "unstorage";
import redisDriverModule from "unstorage/drivers/redis";
import fsDriverModule from "unstorage/drivers/fs";
import memoryDriverModule from "unstorage/drivers/memory";
import { createLogger } from "@raypx/logger";

const logger = createLogger({ name: "storage" });

// unstorage's CJS declarations and ESM runtime disagree about default exports under NodeNext.
function driverFactory<Options>(module: unknown): (options: Options) => Driver<Options, unknown> {
  const factory =
    typeof module === "function"
      ? module
      : module !== null && typeof module === "object" && "default" in module
        ? module.default
        : undefined;
  if (typeof factory !== "function") throw new TypeError("Storage driver must export a factory");
  return factory as (options: Options) => Driver<Options, unknown>;
}

const memoryDriver = driverFactory<void>(memoryDriverModule);
const redisDriver = driverFactory<BuiltinDriverOptions["redis"]>(redisDriverModule);
const fsDriver = driverFactory<BuiltinDriverOptions["fs"]>(fsDriverModule);

/** Explicit driver selection: memory takes precedence over Redis, then filesystem. */
export interface StorageConfig {
  /** Redis connection URL. Connections remain lazy until the first Redis operation. */
  redis?: string;
  /** Filesystem base path; defaults to `./data/cache` relative to the current cwd. */
  fsBase?: string;
  /** Select memory regardless of other supplied driver options. Defaults to false. */
  memory?: boolean;
}

/**
 * Creates an independently owned storage instance without reading environment variables.
 *
 * Explicit memory wins over Redis; otherwise a nonempty Redis URL wins over the
 * filesystem base. Filesystem is the default even in `NODE_ENV=test`. Each call
 * owns its driver and idempotent `dispose()`, including concurrent disposal.
 * Importing the factory creates no driver, connection, or filesystem directory.
 * Drivers configured with the same filesystem path or Redis backend still share
 * persisted data. The caller supplies validated configuration and owns disposal.
 *
 * @param config - Explicit driver configuration
 * @returns Storage usable directly by `createCache`, with an idempotent disposer
 *
 * @example
 * ```typescript
 * const storage = createStorageInstance({ memory: true });
 * try {
 *   await storage.setItem('key', { enabled: true });
 * } finally {
 *   await storage.dispose();
 * }
 * ```
 */
export function createStorageInstance(config: StorageConfig = {}): Storage {
  let driver: Driver;
  if (config.memory) {
    logger.info("Using memory storage");
    driver = memoryDriver();
  } else if (config.redis) {
    logger.info("Using Redis storage");
    driver = redisDriver({ url: config.redis, lazyConnect: true });
  } else {
    logger.info("Using filesystem storage");
    driver = fsDriver({ base: config.fsBase || "./data/cache" });
  }
  const instance = createUnstorage({ driver });
  const dispose = instance.dispose.bind(instance);
  let disposal: Promise<void> | undefined;
  instance.dispose = () => (disposal ??= Promise.resolve().then(dispose));
  return instance;
}
