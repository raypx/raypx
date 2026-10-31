import type { RelayScheduler } from "../../src/scheduler.js";

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Tests drive one scheduled callback at a time and await the operation's own milestone. */
export class ManualScheduler implements RelayScheduler {
  private time = Date.parse("2026-01-01T00:00:00Z");
  private sequence = 0;
  private jobs = new Map<number, { at: number; callback: () => void; interval?: number }>();
  readonly scheduled: number[] = [];
  now = () => this.time;
  random = () => 0;
  timeout = (callback: () => void, delay: number) => this.add(callback, delay);
  interval = (callback: () => void, delay: number) => this.add(callback, delay, delay);
  private add(callback: () => void, delay: number, interval?: number) {
    const id = ++this.sequence;
    this.scheduled.push(delay);
    this.jobs.set(id, { at: this.time + delay, callback, ...(interval ? { interval } : {}) });
    return () => {
      this.jobs.delete(id);
    };
  }
  get pending() {
    return this.jobs.size;
  }
  get nextDelay() {
    return Math.min(...[...this.jobs.values()].map((job) => job.at - this.time));
  }
  advance(milliseconds: number) {
    const target = this.time + milliseconds;
    for (;;) {
      const next = [...this.jobs]
        .filter(([, job]) => job.at <= target)
        .sort(([a, left], [b, right]) => left.at - right.at || a - b)[0];
      if (!next) break;
      const [id, job] = next;
      this.time = job.at;
      if (job.interval) job.at += job.interval;
      else this.jobs.delete(id);
      job.callback();
    }
    this.time = target;
  }
}

export class RelaySocket extends EventTarget {
  readyState = 0;
  bufferedAmount = 0;
  readonly frames: Record<string, unknown>[] = [];
  readonly closed = deferred<number>();
  private listeners: {
    predicate: (frame: Record<string, unknown>) => boolean;
    resolve: (frame: Record<string, unknown>) => void;
  }[] = [];
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  receive(frame: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }));
  }
  send(value: string) {
    const frame = JSON.parse(value) as Record<string, unknown>;
    this.frames.push(frame);
    for (const listener of this.listeners.filter((candidate) => candidate.predicate(frame))) {
      this.listeners.splice(this.listeners.indexOf(listener), 1);
      listener.resolve(frame);
    }
  }
  sent(predicate: (frame: Record<string, unknown>) => boolean) {
    const frame = this.frames.find(predicate);
    if (frame) return Promise.resolve(frame);
    return new Promise<Record<string, unknown>>((resolve) =>
      this.listeners.push({ predicate, resolve }),
    );
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close", { code }));
    this.closed.resolve(code);
  }
  asWebSocket() {
    return this as unknown as WebSocket;
  }
}
