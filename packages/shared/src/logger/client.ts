import { clearIdentity, initLog, log, setIdentity, setMinLevel } from "evlog/client";
import type { LogLevel } from "evlog";

export interface ClientLoggerOptions {
  service: string;
  enabled?: boolean;
  pretty?: boolean;
  minLevel?: LogLevel;
}

export function initClientLogger(options: ClientLoggerOptions): void {
  initLog({
    service: options.service,
    enabled: options.enabled ?? true,
    console: true,
    pretty: options.pretty ?? false,
    minLevel: options.minLevel ?? "info",
  });
}

export { clearIdentity, log, setIdentity, setMinLevel };
export type { LogLevel } from "evlog";
