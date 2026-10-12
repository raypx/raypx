import type { ClientLoggerOptions } from "@voidmix/shared/logger/client";

type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
type LoggerLoader = () => Promise<
  Pick<typeof import("@voidmix/shared/logger/client"), "initClientLogger">
>;

let loggerScheduled = false;

const defaultLoader: LoggerLoader = () => import("@voidmix/shared/logger/client");

export function scheduleClientLogger(
  options: ClientLoggerOptions,
  load: LoggerLoader = defaultLoader,
): void {
  if (loggerScheduled || typeof window === "undefined") return;
  loggerScheduled = true;

  const initialize = () => {
    void load()
      .then(({ initClientLogger }) => initClientLogger(options))
      .catch(() => undefined);
  };

  const requestIdle = (
    window as Window & { requestIdleCallback?: (callback: IdleCallback) => number }
  ).requestIdleCallback;

  if (requestIdle) {
    requestIdle(initialize);
  } else {
    window.setTimeout(initialize, 0);
  }
}

export function resetClientLoggerScheduleForTests(): void {
  loggerScheduled = false;
}
