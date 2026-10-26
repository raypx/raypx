import { createLogger, initLogger } from "@raypx/logger";
import { createManagedDrain } from "@raypx/logger/managed";
import { createStreamDrain } from "@raypx/logger/stream";
import type { RecordDiagnostic } from "./diagnostics";

/** The only top-level fields a CLI diagnostic may carry; everything else is dropped. */
const CLI_LOG_FIELDS = [
  "operation",
  "mode",
  "outcome",
  "code",
  "id",
  "jobId",
  "status",
  "exitCode",
  "elapsedMs",
  "durationMs",
  "bufferedBytes",
  "error",
] as const;

/** Called once by the executable, never by an imported runtime or a unit test. */
export async function createCliLogging() {
  const output = createStreamDrain();
  const drain = createManagedDrain({ sink: output, policy: { fields: CLI_LOG_FIELDS } });
  initLogger({
    env: { service: "raypx-cli", environment: "production" },
    silent: true,
    pretty: false,
    redact: true,
    drain,
  });
  const record: RecordDiagnostic = (event) => {
    const log = createLogger({ ...event });
    if (event.operation === "agent.maintenance") log.setLevel("warn");
    if (
      event.operation === "scheduler.failed" ||
      ("outcome" in event && event.outcome === "failed") ||
      (event.operation === "job.completed" && event.status === "failed")
    ) {
      log.setLevel("error");
      log.set({ error: { code: "code" in event ? event.code : "LOCAL_ERROR" } });
    }
    log.emit();
  };
  return { record, close: () => drain.close() };
}
