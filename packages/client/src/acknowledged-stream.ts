import { systemRelayScheduler, type RelayScheduler } from "./scheduler.js";

export interface StreamCursor {
  readonly streamId: string;
  readonly sequence: number;
  readonly snapshotId?: string;
}

const equalCursor = (left: StreamCursor, right: StreamCursor) =>
  left.streamId === right.streamId &&
  left.sequence === right.sequence &&
  left.snapshotId === right.snapshotId;

/** One ordered exchange at a time; only an exact ACK commits its cursor. */
export class AcknowledgedStream {
  private pending: { cursor: StreamCursor; settle(error?: unknown): void } | undefined;
  private committed: StreamCursor | undefined;
  constructor(
    private readonly scheduler: Pick<RelayScheduler, "timeout"> = systemRelayScheduler,
    private readonly timeoutMs = 10_000,
    private readonly error: (code: string, message: string) => Error = (_code, message) =>
      new Error(message),
  ) {}
  get cursor() {
    return this.committed;
  }
  reset(cursor?: StreamCursor) {
    this.pending?.settle(this.error("NETWORK_UNAVAILABLE", "Stream reset"));
    this.committed = cursor;
  }
  acknowledge(cursor: StreamCursor) {
    if (!this.pending || !equalCursor(this.pending.cursor, cursor)) return false;
    this.pending.settle();
    return true;
  }
  wait(cursor: StreamCursor, signal: AbortSignal, send?: () => void): Promise<void> {
    if (this.pending) throw this.error("STREAM_BUSY", "An acknowledgement is already pending");
    return new Promise<void>((resolve, reject) => {
      signal.throwIfAborted();
      const aborted = () => pending.settle(signal.reason);
      const pending = {
        cursor: Object.freeze({ ...cursor }),
        settle: (error?: unknown) => {
          if (this.pending !== pending) return;
          this.pending = undefined;
          cancelTimeout();
          signal.removeEventListener("abort", aborted);
          if (error !== undefined) reject(error);
          else {
            this.committed = pending.cursor;
            resolve();
          }
        },
      };
      this.pending = pending;
      signal.addEventListener("abort", aborted, { once: true });
      const cancelTimeout = this.scheduler.timeout(
        () => pending.settle(this.error("NETWORK_UNAVAILABLE", "Acknowledgement timed out")),
        this.timeoutMs,
      );
      try {
        send?.();
      } catch (error) {
        pending.settle(error);
      }
    });
  }
}
