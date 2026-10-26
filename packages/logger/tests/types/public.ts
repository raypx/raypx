import {
  createError,
  createLogger,
  createRequestLogger,
  initLogger,
  parseError,
  type DrainContext,
  type LoggerConfig,
} from "@raypx/logger";
import { getLogger, runWithLogger, useLogger } from "@raypx/logger/context";
import { createDrainPipeline, type PipelineDrainFn } from "@raypx/logger/pipeline";
import { createManagedDrain, type DrainStats } from "@raypx/logger/managed";

const managed = createManagedDrain({ policy: { fields: ["operation"] }, sink: () => {} });
const stats: DrainStats = managed.stats();
void stats;
managed({ event: { operation: "consumer" } });
await managed.close();

const drain: PipelineDrainFn<DrainContext> = createDrainPipeline<DrainContext>()((batch) => {
  const service: string | undefined = batch[0]?.event.service;
  void service;
});
const config: LoggerConfig = { silent: true, redact: true, drain };
initLogger(config);
const logger = createLogger<{ job: { id: string; count: number } }>({ job: { id: "sync" } });
logger.set({ job: { count: 1 } });
// @ts-expect-error Typed fields must retain their value types through the wrapper.
logger.set({ job: { count: "one" } });
const result: number = runWithLogger(logger, () => {
  useLogger<{ job: { id: string; count: number } }>().set({ job: { count: 2 } });
  getLogger()?.set({ source: "consumer" });
  return 42;
});
void result;
const request = createRequestLogger({ method: "GET", path: "/health", requestId: "check" });
request.error(createError({ message: "Unavailable", status: 503, why: "Dependency failed" }));
const status: number = parseError(new Error("failed")).status;
void status;
request.emit();
logger.emit();
await drain.flush();
