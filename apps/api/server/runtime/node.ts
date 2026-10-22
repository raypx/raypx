import { RelayHub } from "../relay/hub.js";
import { connectDatabase } from "@raypx/database/connection";
import { createStreamDrain } from "@raypx-kit/logger/stream";
import { getApiEnvironment, type ApiEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { errorReports } from "../error-reports.js";
import { createRuntime, type ApiRuntime, type RuntimeProviders } from "./shared.js";
import { connectRedis } from "./redis.js";

export type { ApiRuntime } from "./shared.js";

/** Socket address written by the Node entry; the default auth rate-limit key. */
export const CLIENT_IP_HEADER = "x-raypx-client-ip";

export async function createApiRuntime(
  environment: ApiEnvironment,
  providers: RuntimeProviders = {},
): Promise<ApiRuntime> {
  const logger = createApiLogging({
    environment: environment.NODE_ENV,
    sink: errorReports(environment, createStreamDrain()),
  });
  // Without AUTH_IP_HEADERS a direct Node deployment limits by socket address.
  const ipAddressHeaders = environment.ipAddressHeaders.length
    ? environment.ipAddressHeaders
    : [CLIENT_IP_HEADER];
  return createRuntime(
    { ...environment, ipAddressHeaders },
    {
      ...providers,
      logger,
      onRevoke: (userId, deviceId) => nodeRelay.revoke(userId, deviceId),
      connect: () => connectDatabase(environment.DATABASE_URL),
      closeLogger: () => logger.close(),
      ...(environment.REDIS_URL ? { redis: connectRedis(environment.REDIS_URL) } : {}),
    },
  );
}

let runtimePromise: Promise<ApiRuntime> | undefined;
export const nodeRelay = new RelayHub(async (run) => run((await getApiRuntime()).control));
export function getApiRuntime(): Promise<ApiRuntime> {
  return (runtimePromise ??= Promise.resolve().then(() => createApiRuntime(getApiEnvironment())));
}
export async function closeApiRuntime(): Promise<void> {
  await nodeRelay.shutdown();
  await (await runtimePromise)?.close();
}
