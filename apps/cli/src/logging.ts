import { createLogger, initLogger } from "@raypx/logger";
import { createManagedDrain } from "@raypx/logger/managed";
import { createStreamDrain } from "@raypx/logger/stream";
import type { RecordDiagnostic } from "./diagnostics.js";

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
    redact: {
      // The generic card masker also matches the numeric prefix of a valid UUID.
      // Consume complete UUIDs first, preserving them only in correlation fields.
      builtins: ["email", "ipv4", "phone", "jwt", "bearer", "iban", "secrets"],
      patterns: [
        /\b([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi,
      ],
      replacement: (match, context) =>
        context.groups?.[0] && (context.path === "id" || context.path === "jobId")
          ? String(match)
          : "[REDACTED]",
    },
    drain,
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
  return { record, close: () => drain.close() };
}
