import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { env } from "./env";
import * as schema from "./schema";

/**
 * Create PostgreSQL client with configurable connection pool and prepared statements.
 * @param url - Connection string from DATABASE_URL environment variable
 * @param options - Connection options (see postgres.Options)
 * @param options.max - Maximum number of connections (controlled via DATABASE_MAX_CONNECTIONS, default: 10 in production, 1 in development)
 * @param options.idle_timeout - Idle connection timeout in seconds (default: 20)
 * @param options.connect_timeout - Connect timeout in seconds (default: 10)
 * @param options.prepare - Enable prepared statements (controlled via DATABASE_PREPARE, default: false)
 *   Set to true for direct PostgreSQL connections (better performance).
 *   Keep false when using PgBouncer transaction mode or connection poolers that don't support prepared statements.
 * @returns PostgreSQL client instance
 */
function createPostgresClient(url: string): Sql {
  const options: postgres.Options<Record<string, never>> = {
    max: env.DATABASE_MAX_CONNECTIONS ?? (process.env.NODE_ENV === "production" ? 10 : 1),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: env.DATABASE_PREPARE ?? false,
  };

  return postgres(url, options);
}

const client = createPostgresClient(env.DATABASE_URL);

export const db = drizzle(client, { schema });
