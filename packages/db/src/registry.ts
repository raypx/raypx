import { createRegistry } from "@raypx/shared/registry";
import { envs } from "./envs";
import * as schemas from "./schemas";
import type { DatabaseProvider } from "./types";

/**
 * Database provider registry
 * Lazy loads database clients based on the configured provider
 */
const databaseRegistry = createRegistry<any, DatabaseProvider>();

databaseRegistry.register("neon", async () => {
  const { createClient } = await import("./adapters/neon");

  return createClient({
    databaseUrl: envs().DATABASE_URL,
    schema: schemas,
  });
});

databaseRegistry.register("postgres", async () => {
  const { createClient } = await import("./adapters/postgres");

  return createClient({
    databaseUrl: envs().DATABASE_URL,
    schema: schemas,
  });
});

export { databaseRegistry };
