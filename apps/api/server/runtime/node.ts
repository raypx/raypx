import { connectDatabase } from "@raypx/database/connection";
import { createStreamDrain } from "@raypx-kit/logger/stream";
import { getApiEnvironment, type ApiEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { createRuntime, type ApiRuntime } from "./shared.js";

export type { ApiRuntime } from "./shared.js";

export async function createApiRuntime(environment: ApiEnvironment): Promise<ApiRuntime> {
  const logger = createApiLogging({
    environment: environment.NODE_ENV,
    sink: createStreamDrain(),
  });
  return createRuntime(environment, {
    logger,
    connect: () => connectDatabase(environment.DATABASE_URL),
    closeLogger: () => logger.close(),
  });
}

let runtimePromise: Promise<ApiRuntime> | undefined;
export function getApiRuntime(): Promise<ApiRuntime> {
  return (runtimePromise ??= Promise.resolve().then(() => createApiRuntime(getApiEnvironment())));
}
export async function closeApiRuntime(): Promise<void> {
  await (await runtimePromise)?.close();
}
