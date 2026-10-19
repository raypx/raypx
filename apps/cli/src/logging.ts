import { initLogger } from "@voidmix/logger";
import { createStderrDrain } from "@voidmix/logger/node";
import type { RecordDiagnostic } from "./diagnostics";

/** Called once by the executable, never by an imported runtime or a unit test. */
export async function createCliLogging() {
  const logging = await initLogger({
    service: "raypx-cli",
    environment: "production",
    drain: createStderrDrain(),
  });
  const record: RecordDiagnostic = (event) => {
    const log = logging.createLogger(event);
    if (
      event.operation === "scheduler.failed" ||
      ("outcome" in event && event.outcome === "failed") ||
      (event.operation === "job.completed" && event.status === "failed")
    ) {
      log.error({ code: "code" in event ? event.code : "LOCAL_ERROR" });
    }
    log.emit();
  };
  return { record, close: () => logging.close() };
}
