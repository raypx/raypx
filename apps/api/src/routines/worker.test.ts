import { afterEach, expect, it, vi } from "vitest";
import { createRoutineWorker } from "./worker.js";
afterEach(() => vi.useRealTimers());
it("performs no construction I/O, scans only after worker start, and drains on close", async () => {
  vi.useFakeTimers();
  const scan = vi.fn(async () => {});
  const failed = vi.fn();
  const worker = createRoutineWorker({ scan }, 1_000, failed);
  expect(scan).not.toHaveBeenCalled();
  await worker.start();
  expect(scan).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(scan).toHaveBeenCalledTimes(2);
  worker.stop();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(scan).toHaveBeenCalledTimes(2);
  await worker.close();
  expect(failed).not.toHaveBeenCalled();
});
