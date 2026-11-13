import type { RoutinesService } from "@raypx/jobs/routines";

/** Construction is inert; only an explicitly started worker scans durable schedules. */
export function createRoutineWorker(
  routines: Pick<RoutinesService, "scan">,
  intervalMs: number,
  onError: () => void,
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Promise<void> | undefined;
  let stopped = false;
  function scan() {
    if (active || stopped) return active ?? Promise.resolve();
    active = routines
      .scan()
      .catch(onError)
      .finally(() => {
        active = undefined;
      });
    return active;
  }
  return {
    async start() {
      if (timer || stopped) return;
      timer = setInterval(() => {
        void scan();
      }, intervalMs);
      timer.unref();
      await scan();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    async close() {
      this.stop();
      await active;
    },
  };
}
