import { sql } from "drizzle-orm";
import { connectDatabase } from "@raypx/database/connection";
import { ControlService, ControlProjects } from "@raypx/control";
import { createControlRepository, createContextRepository } from "@raypx/control/postgres";
import { RelayHub, RedisRelayCluster } from "@raypx/control/relay";
import { ContextLibraryService } from "@raypx/memory/server";
import { startRelayServer } from "./server.js";
import type { RelayEnvironment } from "./env.js";

export async function createRelayRuntime(environment: RelayEnvironment) {
  const connection = connectDatabase(environment.DATABASE_URL);
  const repository = createControlRepository(connection.db);
  const projects = new ControlProjects(repository);
  const memory = new ContextLibraryService({
    repository: createContextRepository(connection.db),
    scope: "account",
    validateProject: (owner, target) => projects.validateContextProject(owner, target),
  });
  const control = new ControlService(
    repository,
    Date.now,
    (owner, selection, target, prompt) => memory.resolve(owner, selection, target, prompt),
    projects,
  );
  const hub = new RelayHub(async (run) => run(control));
  try {
    // A configured broker outage leaves liveness available but readiness closed.
    await hub.attachCluster(new RedisRelayCluster(environment.REDIS_URL)).catch(() => {});
    const server = startRelayServer({
      hub,
      databaseReady: () => connection.db.execute(sql`select 1`),
      allowedOrigins: environment.allowedOrigins,
      hostname: environment.HOST,
      port: environment.PORT,
    });
    let closing: Promise<void> | undefined;
    return {
      ...server,
      close: () =>
        (closing ??= (async () => {
          try {
            await server.close();
          } finally {
            await connection.close();
          }
        })()),
    };
  } catch (error) {
    try {
      await hub.shutdown();
    } finally {
      await connection.close();
    }
    throw error;
  }
}
