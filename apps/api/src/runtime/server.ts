import { createConversationFanout } from "@raypx/agents/server/postgres";
import { createSpaceFanout } from "@raypx/spaces/server/postgres";
import { ConversationStream } from "../conversations/stream.js";
import { createConversationSocketRoutes } from "../conversations/socket.js";
import {
  createRemoteRelay,
  RedisRelayCluster,
  createRelayJobExecutor,
  RelayHub,
} from "@raypx/control/relay";
import { connectRuntimeDatabase } from "./database.js";
import { createStreamDrain } from "@raypx/logger/stream";
import { type ApiEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { errorReports } from "../error-reports.js";
import { createRuntime, type ApiRuntime, type RuntimeProviders } from "./shared.js";
import { connectRedis } from "./redis.js";
import { migrateApiDatabase } from "./migrations.js";
import { createClientIpReader } from "../app/client-ip.js";
import { createRelaySocketRoutes } from "../routers/relay/socket.js";

/** Socket address written by the server entry; the default auth rate-limit key. */
export const CLIENT_IP_HEADER = "x-raypx-client-ip";
type ServerRuntime = ApiRuntime & {
  relay: RelayHub | Awaited<ReturnType<typeof createRemoteRelay>>;
  hub: RelayHub | undefined;
  allowedOrigins: string[];
  clientIp: ReturnType<typeof createClientIpReader>;
  start(): Promise<void>;
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
  // Preserve the existing explicit combined deployment setting while all is the new default.
  const combined = environment.SERVER_ROLE !== "api";
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
      connect: () => connectRuntimeDatabase(environment.DATABASE_URL),
      closeLogger: () => logger.close(),
      ...(combined || environment.REDIS_URL
        ? {
            relayReadiness: async () => {
              if (!relay?.ready()) throw new Error("Relay unavailable");
            },
          }
        : {}),
      ...(environment.REDIS_URL ? { redis: connectRedis(environment.REDIS_URL) } : {}),
    },
  );
  const hub = combined ? new RelayHub(async (use) => use(runtime.control)) : undefined;
  const cluster = environment.REDIS_URL ? new RedisRelayCluster(environment.REDIS_URL) : undefined;
  const fanout =
    providers.createConversationFanout?.() ?? createConversationFanout(environment.DATABASE_URL);
  const spaceFanout =
    providers.createSpaceFanout?.() ?? createSpaceFanout(environment.DATABASE_URL);
  const events = new ConversationStream({
    spaces: runtime.spaces,
    conversations: runtime.conversations,
    readSession: runtime.readSession,
    fanout,
    live: runtime.liveReplies,
    spaceEvents: runtime.spaceManagement,
    spaceFanout,
    screens: runtime.computerScreens,
  });
  try {
    await events.start();
    if (hub) {
      relay = hub;
      // The broker keeps reconnecting and `/ready` reports the relay state; record the
      // degraded start instead of running single-node without a trace.
      if (cluster)
        await hub.attachCluster(cluster).catch(() => {
          logger
            .createLogger({ operation: "relay.cluster" })
            .emit({ status: 503, code: "RELAY_CLUSTER_UNAVAILABLE" });
        });
    } else {
      relay = await createRemoteRelay(runtime.control, cluster);
    }
  } catch (error) {
    await events.shutdown().catch(() => {});
    await fanout.close().catch(() => {});
    await spaceFanout.close().catch(() => {});
    await hub?.shutdown().catch(() => {});
    await runtime.close();
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    ...runtime,
    app: runtime.app
      .route(
        "/events",
        createConversationSocketRoutes({
          stream: events,
          allowedOrigins: environment.allowedOrigins,
          readSession: runtime.readSession,
        }),
      )
      .route(
        "/relay",
        createRelaySocketRoutes({ hub, allowedOrigins: environment.allowedOrigins }),
      ),
    relay,
    hub,
    allowedOrigins: environment.allowedOrigins,
    clientIp: createClientIpReader(environment.ipAddressHeaders, environment.trustedProxies),
    start: async () => {
      if (combined) {
        await runtime.runner.startWorker(fanout);
        await runtime.routineWorker.start();
        await runtime.spaceDeletionWorker.start();
      }
    },
    close: () =>
      (closing ??= (async () => {
        try {
          await events
            .shutdown()
            .finally(() => fanout.close())
            .finally(() => spaceFanout.close())
            .finally(() => relay.shutdown());
        } finally {
          await runtime.close();
        }
      })()),
  };
}
