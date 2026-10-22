import { connectDatabase } from "@raypx/database/connection";

import { getApiEnvironment } from "../env.js";
import { createApiLogging, type ApiLogging } from "../logging.js";
import { errorReports } from "../error-reports.js";
import { createRuntime, type RuntimeProviders } from "./shared.js";
import { createCache } from "../cache/cache.js";
import { createMemoryStore } from "../cache/memory.js";

export interface CloudflareBindings {
  [key: string]: unknown;
  RAYPX_RELAY?: { getByName(name: string): { fetch(request: Request): Promise<Response> } };
  HYPERDRIVE?: { connectionString: string };
}

export function getCloudflareEnvironment(bindings: CloudflareBindings) {
  const values = Object.fromEntries(
    Object.entries(bindings).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  values.NODE_ENV ??= "production";
  // Cloudflare sets this header itself; clients cannot forge it through the edge.
  values.AUTH_IP_HEADERS ??= "cf-connecting-ip";
  if (bindings.HYPERDRIVE) values.DATABASE_URL = bindings.HYPERDRIVE.connectionString;
  return getApiEnvironment(values);
}

// evlog configuration is global to the isolate. Reuse the console logger, while
// every request owns its database client and auth context.
let logging: ApiLogging | undefined;
// Request runtimes share one memory cache per isolate; values never span isolates.
const cache = createCache(createMemoryStore());
export async function createCloudflareRuntime(
  bindings: CloudflareBindings,
  providers: RuntimeProviders = {},
) {
  const environment = getCloudflareEnvironment(bindings);
  const logger = (logging ??= createApiLogging({
    environment: environment.NODE_ENV,
    sink: errorReports(environment, ({ event }) => {
      console.log(JSON.stringify(event));
    }),
  }));
  return createRuntime(environment, {
    cache,
    ...providers,
    logger,
    ...(bindings.RAYPX_RELAY
      ? {
          onRevoke: async (userId: string, deviceId: string) => {
            await bindings.RAYPX_RELAY!.getByName(userId).fetch(
              new Request("https://relay/revoke", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ userId, deviceId }),
              }),
            );
          },
        }
      : {}),
    connect: () => connectDatabase(environment.DATABASE_URL, { max: 5, fetchTypes: false }),
    // Workers have no process shutdown hook; flush without closing the shared logger.
    closeLogger: () => logger.flush(),
  });
}
