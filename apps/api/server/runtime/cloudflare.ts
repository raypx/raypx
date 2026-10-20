import { connectDatabase } from "@raypx/db/connection";
import { initLogger, type LoggerRuntime } from "@voidmix/logger";
import { getApiEnvironment } from "../env.js";
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

// Logger initialization owns a process-wide slot. Reuse only the console logger,
// while every request owns its database client and auth context.
let loggerPromise: Promise<LoggerRuntime> | undefined;
export async function createCloudflareRuntime(bindings: CloudflareBindings) {
  const environment = getCloudflareEnvironment(bindings);
  const logger = await (loggerPromise ??= initLogger({
    service: "raypx-api",
    environment: environment.NODE_ENV,
    drain: ({ event }) => {
      console.log(JSON.stringify(event));
    },
  }).catch((error: unknown) => {
    loggerPromise = undefined;
    throw error;
  }));
  return createRuntime(environment, {
    logger,
    connect: () => connectDatabase(environment.DATABASE_URL, { max: 5, fetchTypes: false }),
    // Workers have no process shutdown hook; flush without closing the shared logger.
    closeLogger: () => logger.flush(),
  });
}
