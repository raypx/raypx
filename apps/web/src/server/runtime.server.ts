import { loadServerEnv } from "@raypx/env/server";
import { configureLogging, createLogger } from "@raypx/logger";
import { RuntimeLifecycle } from "@raypx/api/runtime";

const env = loadServerEnv();
// Nitro's listener must consume the same normalized values that passed validation.
process.env.NITRO_HOST = env.HOST;
process.env.NITRO_PORT = String(env.PORT);
configureLogging({ environment: env.NODE_ENV, level: env.LOG_LEVEL, version: env.APP_VERSION });
export const runtime = new RuntimeLifecycle();
runtime.markReady();
export const runtimeLogger = createLogger({ name: "web" });
