import type { JobRun } from "@raypx/contracts/local";
import { LocalError } from "./runtime/errors";

export type Diagnostic =
  | {
      operation: "cli.completed";
      mode: "command" | "stdio" | "version" | "tui";
      outcome: "success" | "failed";
      elapsedMs: number;
      code?: string;
    }
  | {
      operation: "job.completed";
      id: string;
      jobId: string;
      status: JobRun["status"];
      exitCode: number | null;
      elapsedMs: number;
      code?: string;
    }
  | { operation: "scheduler.failed"; jobId: string; code: string }
  | { operation: "stdio.backpressure"; outcome: "failed"; bufferedBytes: number };

export type RecordDiagnostic = (event: Diagnostic) => void;

export function recordDiagnostic(record: RecordDiagnostic | undefined, event: Diagnostic) {
  try {
    record?.(event);
  } catch {
    // Diagnostics must never change local execution or protocol results.
  }
}

export function diagnosticCode(error: unknown) {
  return error instanceof LocalError && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
    ? error.code
    : "LOCAL_ERROR";
}
