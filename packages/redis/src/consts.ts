// ==================== Redis Client Configuration ====================

/** Maximum length of Redis command queue */
export const MAX_COMMANDS_QUEUE_LENGTH = 1000;

// ==================== Redis Response Constants ====================

/** Redis success response identifier */
export const REDIS_SUCCESS = "OK";

/** Redis exists identifier */
export const REDIS_EXISTS = 1;

// ==================== Time-related Constants ====================

/** Default cache expiration time in seconds */
export const DEFAULT_TTL_SECONDS = 3600; // 1 hour

/** Percentage multiplier */
export const PERCENTAGE_MULTIPLIER = 100;

/** Hit rate precision */
export const HIT_RATE_PRECISION = 100;

// ==================== Network Configuration Constants ====================

/** Default Redis host address */
export const DEFAULT_REDIS_HOST = "localhost";

/** Default Redis port */
export const DEFAULT_REDIS_PORT = 6379;

/** Default Redis database number */
export const DEFAULT_REDIS_DB = 0;

// ==================== Statistics Initialization Constants ====================

/** Initial hits count */
export const INITIAL_HITS = 0;

/** Initial misses count */
export const INITIAL_MISSES = 0;

/** Initial total keys count */
export const INITIAL_TOTAL_KEYS = 0;

/** Initial memory usage */
export const INITIAL_MEMORY_USAGE = 0;

// ==================== Cache Key Constants ====================

/** Compound key separator */
export const COMPOUND_KEY_SEPARATOR = ":";

/** Array index not found identifier */
export const ARRAY_INDEX_NOT_FOUND = -1;
