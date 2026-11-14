import { LocalError } from "./runtime/errors.js";
export type Diagnostic = {
  operation: "cli.completed";
  mode: "command" | "version";
  outcome: "success" | "failed";
  elapsedMs: number;
  code?: string;
};
export type RecordDiagnostic = (event: Diagnostic) => void;
export function recordDiagnostic(record: RecordDiagnostic | undefined, event: Diagnostic) {
  try {
    record?.(event);
  } catch {}
}
export function diagnosticCode(error: unknown) {
  return error instanceof LocalError && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
    ? error.code
    : "LOCAL_ERROR";
}
