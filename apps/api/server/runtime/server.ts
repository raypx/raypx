import { RelayHub, type RelayPeer } from "../relay/hub.js";
import { RedisRelayCluster } from "../relay/redis.js";
import { connectDatabase } from "@raypx/database/connection";
import { createStreamDrain } from "@raypx/logger/stream";
import { getApiEnvironment, type ApiEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { errorReports } from "../error-reports.js";
import { createRuntime, type ApiRuntime, type RuntimeProviders } from "./shared.js";
import { connectRedis } from "./redis.js";
import { createClientIpReader } from "../app/client-ip.js";
import { createRelayJobExecutor } from "../relay/jobs.js";

/** Socket address written by the server entry; the default auth rate-limit key. */
export const CLIENT_IP_HEADER = "x-raypx-client-ip";
type ServerRuntime = ApiRuntime & {
  relay: RelayHub;
  clientIp: ReturnType<typeof createClientIpReader>;
};

export async function createApiRuntime(
  environment: ApiEnvironment,
  providers: RuntimeProviders = {},
): Promise<ServerRuntime> {
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
  const relay = new RelayHub(async (run) => run(runtime.control));
  // HTTP liveness remains available during a broker outage. Configured Relay stays closed
  // until its subscriptions recover; it never silently becomes a process-local router.
  if (environment.REDIS_URL)
    await relay.attachCluster(new RedisRelayCluster(environment.REDIS_URL)).catch(() => {});
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
export const serverRelay = {
  async open(peer: RelayPeer) {
    try {
      (await getApiRuntime()).relay.open(peer);
    } catch {
      peer.close(1013, "Relay unavailable");
    }
  },
  async receive(id: string, data: string) {
    await (await getApiRuntime()).relay.receive(id, data);
  },
  async close(id: string) {
    await (await runtimePromise)?.relay.close(id);
  },
};
export function getApiRuntime(): Promise<ServerRuntime> {
  return (runtimePromise ??= Promise.resolve().then(() => createApiRuntime(getApiEnvironment())));
}
export async function closeApiRuntime(): Promise<void> {
  await (await runtimePromise)?.close();
}
