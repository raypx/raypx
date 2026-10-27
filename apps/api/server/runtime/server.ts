import { RelayHub } from "../relay/hub.js";
import { connectDatabase } from "@raypx/database/connection";
import { createStreamDrain } from "@raypx/logger/stream";
import { getApiEnvironment, type ApiEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { errorReports } from "../error-reports.js";
import { createRuntime, type ApiRuntime, type RuntimeProviders } from "./shared.js";
import { connectRedis } from "./redis.js";
import { createClientIpReader } from "../app/client-ip.js";
import { createRelayJobExecutor } from "../relay/jobs.js";

export type { ApiRuntime } from "./shared.js";

/** Socket address written by the server entry; the default auth rate-limit key. */
export const CLIENT_IP_HEADER = "x-raypx-client-ip";
type ServerRuntime = ApiRuntime & { clientIp: ReturnType<typeof createClientIpReader> };

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
      onRevoke: (userId, deviceId) => serverRelay.revoke(userId, deviceId),
      createJobExecutor: (control) => createRelayJobExecutor(control, serverRelay),
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

let runtimePromise: Promise<ServerRuntime> | undefined;
export const serverRelay = new RelayHub(async (run) => run((await getApiRuntime()).control));
export function getApiRuntime(): Promise<ServerRuntime> {
  return (runtimePromise ??= Promise.resolve().then(() => createApiRuntime(getApiEnvironment())));
}
export async function closeApiRuntime(): Promise<void> {
  await serverRelay.shutdown();
  await (await runtimePromise)?.close();
}
