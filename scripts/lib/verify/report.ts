export interface VerifyStageResult {
  id: string;
  status: "passed" | "failed" | "cancelled" | "skipped";
  durationMs: number;
  failure?: string;
}

export interface VerifyReport {
  ok: boolean;
  cancelled: boolean;
  durationMs: number;
  stages: VerifyStageResult[];
}

const sensitiveName =
  /secret|token|password|credential|cookie|authorization|api[_-]?key|dsn|^(?:database|redis)_url$/i;

/** Keep failure diagnostics bounded and remove credential values from the inherited environment. */
export function failureOutput(error: unknown, environment: NodeJS.ProcessEnv): string {
  let output = error instanceof Error ? error.message : "The verification stage failed.";
  const secrets = Object.entries(environment)
    .filter(([name, value]) => sensitiveName.test(name) && Boolean(value))
    .map(([, value]) => value ?? "")
    .sort((first, second) => second.length - first.length);
  for (const secret of secrets) output = output.replaceAll(secret, "[REDACTED]");
  output = stripVTControlCharacters(output)
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\r/g, "")
    .split("\n")
    .slice(-80)
    .join("\n");
  if (output.length > 8000) output = output.slice(-8000);
  return output.trim();
}

export function elapsed(durationMs: number): string {
  return `${(Math.max(0, durationMs) / 1000).toFixed(2)}s`;
}
import { stripVTControlCharacters } from "node:util";
