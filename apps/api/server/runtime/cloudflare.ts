import { connectDatabase } from "@raypx/database/connection";

import { getApiEnvironment } from "../env.js";
import { createApiLogging, type ApiLogging } from "../logging.js";
import { createRuntime } from "./shared.js";

export interface CloudflareBindings {
  [key: string]: unknown;
  HYPERDRIVE?: { connectionString: string };
}

export function getCloudflareEnvironment(bindings: CloudflareBindings) {
  const values = Object.fromEntries(
    Object.entries(bindings).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  values.NODE_ENV ??= "production";
  if (bindings.HYPERDRIVE) values.DATABASE_URL = bindings.HYPERDRIVE.connectionString;
  return getApiEnvironment(values);
}

// evlog configuration is global to the isolate. Reuse the console logger, while
// every request owns its database client and auth context.
let logging: ApiLogging | undefined;
export async function createCloudflareRuntime(bindings: CloudflareBindings) {
  const environment = getCloudflareEnvironment(bindings);
  const logger = (logging ??= createApiLogging({
    environment: environment.NODE_ENV,
    sink: ({ event }) => {
      console.log(JSON.stringify(event));
    },
  }));
  return createRuntime(environment, {
    logger,
    connect: () => connectDatabase(environment.DATABASE_URL, { max: 5, fetchTypes: false }),
    // Workers have no process shutdown hook; flush without closing the shared logger.
    closeLogger: () => logger.flush(),
  });
}
