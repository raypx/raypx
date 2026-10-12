/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resetClientLoggerScheduleForTests, scheduleClientLogger } from "./client-logger";

afterEach(() => {
  resetClientLoggerScheduleForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, "requestIdleCallback", {
    configurable: true,
    value: undefined,
  });
});

const options = {
  service: "web",
  pretty: false,
  minLevel: "info" as const,
};

describe("client logger scheduling", () => {
  it("loads and initializes once during an idle callback", async () => {
    let idleCallback: (() => void) | undefined;
    window.requestIdleCallback = (callback) => {
      idleCallback = callback as () => void;
      return 1;
    };
    const initClientLogger = vi.fn();
    const load = vi.fn(async () => ({ initClientLogger }));

    scheduleClientLogger(options, load);
    scheduleClientLogger(options, load);

    expect(load).not.toHaveBeenCalled();
    idleCallback?.();
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    expect(initClientLogger).toHaveBeenCalledWith(options);
  });

  it("falls back to a timer and ignores loader failures", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => {
      throw new Error("logger unavailable");
    });

    scheduleClientLogger(options, load);

    expect(load).not.toHaveBeenCalled();
    vi.runAllTimers();
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
  });
});
