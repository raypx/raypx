import { createRegistry } from "@raypx/shared/registry";
import type { DatabaseProvider } from "./types";

/**
 * Database provider registry
 * Lazy loads database clients based on the configured provider
 */
const databaseRegistry = createRegistry<any, DatabaseProvider>();

/**
 * Helper to register a database adapter with lazy loading
 */
const registerAdapter = (provider: DatabaseProvider, adapterPath: string) => {
  databaseRegistry.register(provider, async () => {
    const { createClient } = await import(adapterPath);
    const { envs } = await import("./envs");
    const schemas = await import("./schemas");

    return createClient({
      databaseUrl: envs().DATABASE_URL,
      schema: schemas,
    });
  });
};

// Register available database providers
registerAdapter("postgres", "./adapters/postgres");
registerAdapter("neon", "./adapters/neon");

export { databaseRegistry };
