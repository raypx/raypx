import type { Writable } from "node:stream";

export interface StreamDrainOptions {
  /** Defaults to `process.stderr`. A caller-owned stream is flushed but never ended. */
  stream?: Writable;
  /** Events waiting for the stream before new ones are dropped (default 1024). */
  maxPending?: number;
}

export interface StreamDrain {
  (context: { event: unknown }): Promise<void> | undefined;
  /** Waits for written events; rejects once if any write or serialization failed. */
  flush(): Promise<void>;
  /** Stops accepting events, flushes and detaches from the stream. */
  close(): Promise<void>;
}

/**
 * Writes one JSON line per event, in order. Failures are recorded for flush/close
 * instead of being thrown into the code that emitted the event.
 */
export function createStreamDrain({
  stream = process.stderr,
  maxPending = 1024,
}: StreamDrainOptions = {}): StreamDrain {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let failed = false;
  let closed = false;
  const onError = () => {
    failed = true;
  };
  stream.on("error", onError);

  const drain = ((context) => {
    if (closed) return undefined;
    if (pending >= maxPending) {
      failed = true;
      return undefined;
    }
    let line: string;
    try {
      line = `${JSON.stringify(context.event)}\n`;
    } catch {
      failed = true;
      return undefined;
    }
    pending += 1;
    tail = tail.then(
      () =>
        new Promise<void>((resolve) => {
          const done = (error?: Error | null) => {
            if (error) failed = true;
            pending -= 1;
            resolve();
          };
          try {
            stream.write(line, done);
          } catch {
            done(new Error("write failed"));
          }
        }),
    );
    return tail;
  }) as StreamDrain;

  drain.flush = async () => {
    await tail;
    if (failed) {
      failed = false;
      throw new Error("Log stream drain failed");
    }
  };
  drain.close = async () => {
    closed = true;
    try {
      await drain.flush();
    } finally {
      stream.off("error", onError);
    }
  };
  return drain;
}
