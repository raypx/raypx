import { RelayHub } from "../relay/hub.js";
import { connectDatabase } from "@raypx/database/connection";
import { createStreamDrain } from "@raypx-kit/logger/stream";
import { getApiEnvironment, type ApiEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { errorReports } from "../error-reports.js";
import { createRuntime, type ApiRuntime, type RuntimeProviders } from "./shared.js";
import { connectRedis } from "./redis.js";
import { createClientIpReader } from "../app/client-ip.js";

export type { ApiRuntime } from "./shared.js";

/** Socket address written by the Node entry; the default auth rate-limit key. */
export const CLIENT_IP_HEADER = "x-raypx-client-ip";
type NodeRuntime = ApiRuntime & { clientIp: ReturnType<typeof createClientIpReader> };

export async function createApiRuntime(
  environment: ApiEnvironment,
  providers: RuntimeProviders = {},
): Promise<NodeRuntime> {
  const logger = createApiLogging({
    environment: environment.NODE_ENV,
    sink: errorReports(environment, createStreamDrain()),
  });
  // Without AUTH_IP_HEADERS a direct Node deployment limits by socket address.
  const runtime = await createRuntime(
    { ...environment, ipAddressHeaders: [CLIENT_IP_HEADER], trustedProxies: [] },
    {
      ...providers,
      logger,
      clientIpHeader: CLIENT_IP_HEADER,
      onRevoke: (userId, deviceId) => nodeRelay.revoke(userId, deviceId),
      connect: () => connectDatabase(environment.DATABASE_URL),
      closeLogger: () => logger.close(),
      ...(environment.REDIS_URL ? { redis: connectRedis(environment.REDIS_URL) } : {}),
    },
  );
  return {
    ...runtime,
    clientIp: createClientIpReader(environment.ipAddressHeaders, environment.trustedProxies),
  };
}

let runtimePromise: Promise<NodeRuntime> | undefined;
export const nodeRelay = new RelayHub(async (run) => run((await getApiRuntime()).control));
export function getApiRuntime(): Promise<NodeRuntime> {
  return (runtimePromise ??= Promise.resolve().then(() => createApiRuntime(getApiEnvironment())));
}
export async function closeApiRuntime(): Promise<void> {
  await nodeRelay.shutdown();
  await (await runtimePromise)?.close();
}
