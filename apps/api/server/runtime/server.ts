import {
  createRemoteRelay,
  RedisRelayCluster,
  createRelayJobExecutor,
  RelayHub,
} from "@raypx/control/relay";
import { connectDatabase } from "@raypx/database/connection";
import { createStreamDrain } from "@raypx/logger/stream";
import { type ApiEnvironment } from "../env.ts";
import { createApiLogging } from "../logging.ts";
import { errorReports } from "../error-reports.ts";
import { createRuntime, type ApiRuntime, type RuntimeProviders } from "./shared.ts";
import { connectRedis } from "./redis.ts";
import { migrateApiDatabase } from "./migrations.ts";
import { createClientIpReader } from "../app/client-ip.ts";

/** Socket address written by the server entry; the default auth rate-limit key. */
export const CLIENT_IP_HEADER = "x-raypx-client-ip";
type ServerRuntime = ApiRuntime & {
  relay: RelayHub | Awaited<ReturnType<typeof createRemoteRelay>>;
  hub: RelayHub | undefined;
  allowedOrigins: string[];
  clientIp: ReturnType<typeof createClientIpReader>;
};

export async function createApiRuntime(
  environment: ApiEnvironment,
  providers: RuntimeProviders = {},
): Promise<ServerRuntime> {
  await migrateApiDatabase(environment);
  const logger = createApiLogging({
    environment: environment.NODE_ENV,
    sink: errorReports(environment, createStreamDrain()),
  });
  let relay: ServerRuntime["relay"];
  // Without AUTH_IP_HEADERS a direct deployment limits by socket address.
  const runtime = await createRuntime(
    { ...environment, ipAddressHeaders: [CLIENT_IP_HEADER], trustedProxies: [] },
    {
      ...providers,
      logger,
      clientIpHeader: CLIENT_IP_HEADER,
      onRevoke: (userId, deviceId) => relay.revoke(userId, deviceId),
      createJobExecutor: (control) =>
        createRelayJobExecutor(control, {
          dispatch: (...args) => relay.dispatch(...args),
          sync: (...args) => relay.sync(...args),
        }),
      connect: () => connectDatabase(environment.DATABASE_URL),
      closeLogger: () => logger.close(),
      relayReadiness: async () => {
        if (!relay?.ready()) throw new Error("Relay unavailable");
      },
      ...(environment.REDIS_URL ? { redis: connectRedis(environment.REDIS_URL) } : {}),
    },
  );
  const hub =
    environment.SERVER_ROLE === "both"
      ? new RelayHub(async (use) => use(runtime.control))
      : undefined;
  const cluster = environment.REDIS_URL ? new RedisRelayCluster(environment.REDIS_URL) : undefined;
  try {
    if (hub) {
      relay = hub;
      if (cluster) await hub.attachCluster(cluster).catch(() => {});
    } else {
      relay = await createRemoteRelay(runtime.control, cluster);
    }
  } catch (error) {
    await hub?.shutdown().catch(() => {});
    await runtime.close();
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    ...runtime,
    relay,
    hub,
    allowedOrigins: environment.allowedOrigins,
    clientIp: createClientIpReader(environment.ipAddressHeaders, environment.trustedProxies),
    close: () =>
      (closing ??= (async () => {
        try {
          await relay.shutdown();
        } finally {
          await runtime.close();
        }
      })()),
  };
}
