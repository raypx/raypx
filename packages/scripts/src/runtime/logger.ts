import { configureLogger, logger } from "@voidmix/shared/logger";

import type { ScriptsEnvironment } from "../env.js";

export type ScriptsLog = (
  level: "info" | "error",
  event: string,
  data?: Record<string, unknown>,
) => void;

export function createScriptsLogger(
  environment: ScriptsEnvironment,
  runtimeEnv: Record<string, string>,
): ScriptsLog {
  configureLogger({
    service: "scripts",
    environment: environment.NODE_ENV,
    pretty: environment.LOG_PRETTY ?? !environment.CI,
    ...(environment.LOG_LEVEL ? { minLevel: environment.LOG_LEVEL } : {}),
    runtimeEnv,
  });

  return (level, event, data = {}) => {
    const entry = logger({ event, ...data });
    if (level === "error") entry.setLevel("error");
    entry.emit();
  };
}
