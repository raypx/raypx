import { createRelayHttpApp } from "../routers/relay/http.js";
import { createRelaySocketRoutes } from "../routers/relay/socket.js";
import { sql } from "drizzle-orm";
import { connectDatabase } from "@raypx/database/connection";
import { ControlService, ControlProjects } from "@raypx/control";
import { createControlRepository } from "@raypx/control/postgres";
import { RelayHub, RedisRelayCluster } from "@raypx/control/relay";
import { ContextLibraryService } from "@raypx/memory/server";
import { createContextRepository } from "@raypx/memory/server/postgres";
import type { RelayEnvironment } from "../env.js";
import { createReadinessCheck } from "../app/readiness.js";
import { createClientIpReader } from "../app/client-ip.js";
import { withSessionAttachments } from "../storage/attachments.js";

/** The relay role owns no Auth, cookies, mail, signer, migrations or scheduled jobs. */
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
    withSessionAttachments(connection.db, (owner, selection, target, prompt) =>
      memory.resolve(owner, selection, target, prompt),
    ),
    projects,
  );
  const hub = new RelayHub(async (use) => use(control));
  try {
    await hub.attachCluster(new RedisRelayCluster(environment.REDIS_URL)).catch(() => {});
    let closing: Promise<void> | undefined;
    const readReadiness = createReadinessCheck({
      database: () => connection.db.execute(sql`select 1`),
      relay: async () => {
        if (!hub.ready()) throw new Error("Unavailable");
      },
    });
    return {
      hub,
      app: createRelayHttpApp(readReadiness).route(
        "/relay",
        createRelaySocketRoutes({ hub, allowedOrigins: environment.allowedOrigins }),
      ),
      allowedOrigins: environment.allowedOrigins,
      clientIp: createClientIpReader([], []),
      close: () =>
        (closing ??= (async () => {
          try {
            await hub.shutdown();
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
