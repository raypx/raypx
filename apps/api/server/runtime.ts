import { createApiRuntime, type ApiRuntime } from "./api/index.js";
import { configureLogger } from "@voidmix/shared/logger";

import { env } from "./env.js";

const loggerConfig = configureLogger({
  service: "api",
  environment: env.NODE_ENV,
  ...(env.LOG_PRETTY !== undefined ? { pretty: env.LOG_PRETTY } : {}),
  ...(env.LOG_LEVEL !== undefined ? { minLevel: env.LOG_LEVEL } : {}),
});
let runtimePromise: Promise<ApiRuntime> | undefined;

export function getApiRuntime(): Promise<ApiRuntime> {
  runtimePromise ??= createApiRuntime({ environment: env, loggerConfig });
  return runtimePromise;
}

export async function closeApiRuntime(): Promise<void> {
  const runtime = await runtimePromise;
  await runtime?.close();
}
