import { createDeviceConnectorRegistry } from "@raypx/computers/server";
import { createDeviceComputersRepository } from "@raypx/computers/server/postgres";
import { createDeviceConnectorRoutes } from "../routers/device-connector.js";
import { createDeviceBroker } from "./device-broker.js";
import { createRelayHttpApp } from "../routers/relay/http.js";
import { sql } from "drizzle-orm";
import { connectRuntimeDatabase } from "./database.js";
import type { RelayEnvironment } from "../env.js";
import { createReadinessCheck } from "../app/readiness.js";
import { createClientIpReader } from "../app/client-ip.js";

/** The relay role owns no Auth, cookies, mail, signer, migrations or scheduled jobs. */
export async function createRelayRuntime(environment: RelayEnvironment) {
  const connection = connectRuntimeDatabase(environment.DATABASE_URL);
  const deviceConnector = createDeviceConnectorRegistry(
    createDeviceComputersRepository(connection.db, environment.DEVICE_CONNECTOR_ORIGIN ?? ""),
    environment.REDIS_URL ? createDeviceBroker(environment.REDIS_URL) : undefined,
  );
  try {
    await deviceConnector.start().catch(() => {});
    let closing: Promise<void> | undefined;
    const readReadiness = createReadinessCheck({
      database: () => connection.db.execute(sql`select 1`),
      relay: async () => {
        if (!deviceConnector.ready()) throw new Error("Connector unavailable");
      },
    });
    return {
      app: createRelayHttpApp(readReadiness).route(
        "/",
        createDeviceConnectorRoutes(deviceConnector),
      ),
      allowedOrigins: environment.allowedOrigins,
      clientIp: createClientIpReader([], []),
      close: () =>
        (closing ??= (async () => {
          try {
            await deviceConnector.shutdown();
          } finally {
            await connection.close();
          }
        })()),
    };
  } catch (error) {
    try {
      await deviceConnector.shutdown();
    } finally {
      await connection.close();
    }
    throw error;
  }
}
