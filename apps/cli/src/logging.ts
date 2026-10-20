import { createLogger, initLogger } from "@raypx-kit/logger";
import { withEventPolicy } from "@raypx-kit/logger/safe";
import { createStreamDrain } from "@raypx-kit/logger/stream";
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
  initLogger({
    env: { service: "raypx-cli", environment: "production" },
    silent: true,
    pretty: false,
    redact: true,
    drain: withEventPolicy(output, { fields: CLI_LOG_FIELDS }),
  });
  const record: RecordDiagnostic = (event) => {
    const log = createLogger({ ...event });
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
  return { record, close: () => output.close() };
}
