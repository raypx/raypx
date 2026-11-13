import { createRelayHttpApp } from "../routers/relay/http.js";
import { createRelaySocketRoutes } from "../routers/relay/socket.js";
import { sql } from "drizzle-orm";
import { connectRuntimeDatabase } from "./database.js";
import { RelayHub, RedisRelayCluster } from "@raypx/control/relay";
import type { RelayEnvironment } from "../env.js";
import { createReadinessCheck } from "../app/readiness.js";
import { createClientIpReader } from "../app/client-ip.js";
import { composeControl } from "./control.js";

/** The relay role owns no Auth, cookies, mail, signer, migrations or scheduled jobs. */
export async function createRelayRuntime(environment: RelayEnvironment) {
  const connection = connectRuntimeDatabase(environment.DATABASE_URL);
  const { control } = composeControl(connection.db);
  const hub = new RelayHub(async (use) => use(control));
  try {
    // The cluster keeps reconnecting; `/ready` reports the relay unavailable until it attaches.
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
