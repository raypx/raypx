import { connectDatabase } from "@raypx/db/connection";
import { initLogger } from "@voidmix/logger";
import { createStderrDrain } from "@voidmix/logger/node";
import { getApiEnvironment, type ApiEnvironment } from "../env.js";
import { createRuntime, type ApiRuntime } from "./shared.js";

export type { ApiRuntime } from "./shared.js";

export async function createApiRuntime(environment: ApiEnvironment): Promise<ApiRuntime> {
  const logger = await initLogger({
    service: "raypx-api",
    environment: environment.NODE_ENV,
    drain: createStderrDrain(),
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
