import { createEventPolicy, type EventPolicyOptions, type SafeDrain } from "./safe.js";

export type ManagedSink = SafeDrain & {
  flush?(): Promise<void>;
  close?(): Promise<void>;
};

export interface ManagedDrainOptions {
  policy: EventPolicyOptions;
  sink: ManagedSink;
  /** Total queued and in-flight events; overflow drops the new event. Default 1024. */
  maxPending?: number;
  /** Default 1 preserves delivery order. Larger values allow concurrent sinks. */
  concurrency?: number;
  /** Bounds close's wait, not uncancellable sink work. Default 10 seconds. */
  closeTimeoutMs?: number;
}

export interface DrainStats {
  readonly pending: number;
  readonly delivered: number;
  /** Failed deliveries or sink lifecycle calls, without their private errors. */
  readonly failed: number;
  readonly dropped: number;
  readonly closed: boolean;
}

export interface ManagedDrain {
  (context: { event: unknown }): void;
  /** Waits for delivery and reports previously unreported loss once. */
  flush(): Promise<void>;
  /** Stops admission immediately; repeated calls share the same result. */
  close(): Promise<void>;
  stats(): DrainStats;
}

/** Independent delivery state; does not initialize or reconfigure evlog. No retries. */
export function createManagedDrain({
  policy,
  sink,
  maxPending = 1024,
  concurrency = 1,
  closeTimeoutMs = 10_000,
}: ManagedDrainOptions): ManagedDrain {
  for (const [name, value] of Object.entries({ maxPending, concurrency, closeTimeoutMs }))
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new RangeError(`${name} must be a positive safe integer`);
  const project = createEventPolicy(policy);
  const queue: Parameters<SafeDrain>[0][] = [];
  let active = 0,
    delivered = 0,
    failed = 0,
    dropped = 0,
    reported = 0;
  let closed = false,
    scheduled = false;
  let idle: (() => void) | undefined;
  let flushing: Promise<void> | undefined;
  let closing: Promise<void> | undefined;

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(pump);
    }
  }
  async function deliver(context: Parameters<SafeDrain>[0]) {
    try {
      await sink(context);
      delivered++;
    } catch {
      failed++;
    } finally {
      active--;
      schedule();
    }
  }
  function pump() {
    scheduled = false;
    while (active < concurrency && queue.length) {
      active++;
      void deliver(queue.shift()!);
    }
    if (!active && !queue.length) {
      idle?.();
      idle = undefined;
    }
  }
  function flush(): Promise<void> {
    return (flushing ??= (async () => {
      if (active || queue.length)
        await new Promise<void>((resolve) => {
          idle = resolve;
        });
      try {
        await sink.flush?.();
      } catch {
        failed++;
      }
      const losses = failed + dropped;
      if (losses > reported) {
        reported = losses;
        throw new Error("Log drain delivery failed");
      }
    })().finally(() => {
      flushing = undefined;
    }));
  }
  async function finish() {
    let failure: Error | undefined;
    try {
      await flush();
    } catch {
      failure = new Error("Log drain delivery failed");
    }
    try {
      await sink.close?.();
    } catch {
      failed++;
      failure ??= new Error("Log drain close failed");
    }
    if (failure) throw failure;
  }
  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Log drain close timed out")), closeTimeoutMs);
    });
    closing = Promise.race([finish(), timeout]).finally(() => clearTimeout(timer));
    return closing;
  }
  return Object.assign(
    (context: { event: unknown }) => {
      if (closed || active + queue.length >= maxPending) {
        dropped++;
        return;
      }
      try {
        // Read data only: accessors and raw context metadata never reach a sink.
        queue.push({ event: project(Object.getOwnPropertyDescriptor(context, "event")?.value) });
        schedule();
      } catch {
        failed++;
      }
    },
    {
      flush,
      close,
      stats: () =>
        Object.freeze({ pending: active + queue.length, delivered, failed, dropped, closed }),
    },
  );
}
