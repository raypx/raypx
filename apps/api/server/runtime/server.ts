import { createRemoteRelay, RedisRelayCluster, createRelayJobExecutor } from "@raypx/control/relay";
import { connectDatabase } from "@raypx/database/connection";
import { createStreamDrain } from "@raypx/logger/stream";
import { getApiEnvironment, type ApiEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { errorReports } from "../error-reports.js";
import { createRuntime, type ApiRuntime, type RuntimeProviders } from "./shared.js";
import { connectRedis } from "./redis.js";
import { migrateApiDatabase } from "./migrations.js";
import { createClientIpReader } from "../app/client-ip.js";

/** Socket address written by the server entry; the default auth rate-limit key. */
export const CLIENT_IP_HEADER = "x-raypx-client-ip";
type ServerRuntime = ApiRuntime & {
  relay: Awaited<ReturnType<typeof createRemoteRelay>>;
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
      ...(environment.REDIS_URL
        ? {
            redis: connectRedis(environment.REDIS_URL),
            relayReadiness: async () => {
              if (!relay?.ready()) throw new Error("Relay unavailable");
            },
          }
        : {}),
    },
  );
  const relay = await createRemoteRelay(
    runtime.control,
    environment.REDIS_URL ? new RedisRelayCluster(environment.REDIS_URL) : undefined,
  );
  let closing: Promise<void> | undefined;
  return {
    ...runtime,
    relay,
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

let runtimePromise: Promise<ServerRuntime> | undefined;
export function getApiRuntime(): Promise<ServerRuntime> {
  return (runtimePromise ??= Promise.resolve().then(() => createApiRuntime(getApiEnvironment())));
}
export async function closeApiRuntime(): Promise<void> {
  await (await runtimePromise)?.close();
}
