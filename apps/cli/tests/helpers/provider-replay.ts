import { z } from "zod";
import type {
  ProcessFactory,
  ProviderProcess,
} from "../../src/runtime/agents/harness/providers/process";

const object = z.record(z.string(), z.unknown());
const recordSchema = z
  .discriminatedUnion("direction", [
    z
      .object({
        direction: z.literal("host"),
        channel: z.enum(["send", "request", "control", "kill"]),
        message: object.optional(),
        method: z.string().optional(),
        reply: object.optional(),
      })
      .strict(),
    z.object({ direction: z.literal("provider"), message: object }).strict(),
    z.object({ direction: z.literal("gate"), name: z.string().min(1) }).strict(),
    z.object({ direction: z.literal("exit"), code: z.number().int() }).strict(),
  ])
  .superRefine((record, context) => {
    if (record.direction !== "host") return;
    if (record.channel === "request" ? !record.method : record.method !== undefined)
      context.addIssue({ code: "custom", message: "Only requests require a method" });
    if (["send", "control"].includes(record.channel) && record.message === undefined)
      context.addIssue({ code: "custom", message: "Protocol delivery requires a message" });
    if (record.channel === "kill" && record.message !== undefined)
      context.addIssue({ code: "custom", message: "Process termination has no message" });
  });
export type ReplayRecord = z.infer<typeof recordSchema>;
export function parseProviderReplay(ndjson: string): ReplayRecord[] {
  const names = new Set<string>();
  return ndjson.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      const record = recordSchema.parse(JSON.parse(line));
      if (record.direction === "gate") {
        if (names.has(record.name)) throw new Error("Duplicate gate");
        names.add(record.name);
      }
      return [record];
    } catch {
      throw new Error(`Invalid provider replay record at line ${index + 1}`);
    }
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => matches(actual[index], value))
    );
  if (expected && typeof expected === "object")
    return (
      !!actual &&
      typeof actual === "object" &&
      Object.entries(expected).every(([key, value]) =>
        matches((actual as Record<string, unknown>)[key], value),
      )
    );
  return Object.is(actual, expected);
}

/** Synthetic directional NDJSON, with explicit gates instead of time or process sleeps. */
export class ProviderReplay {
  private position = 0;
  private receive: ((message: Record<string, unknown>) => void) | undefined;
  private running = false;
  private inFlight = 0;
  private failure: Error | undefined;
  private readonly released = new Set<string>();
  private readonly reached = new Set<string>();
  private readonly waits = new Map<string, ReturnType<typeof deferred<void>>>();
  private readonly drains = new Set<ReturnType<typeof deferred<void>>>();
  private readonly calls: {
    channel: string;
    method?: string;
    message?: unknown;
    done: ReturnType<typeof deferred<Record<string, unknown>>>;
  }[] = [];
  private readonly exited = deferred<number>();
  readonly sent: { channel: string; method?: string; message?: unknown }[] = [];
  readonly launches: { args: string[]; environment?: Record<string, string | undefined> }[] = [];
  readonly process: ProviderProcess = {
    completed: this.exited.promise,
    send: (message) => {
      void this.call("send", message).catch(() => {});
    },
    request: (method, message) => this.call("request", message, method),
    control: (message) => this.call("control", message),
    kill: async () => {
      await this.call("kill");
    },
  };
  readonly factory: ProcessFactory = (_executable, args, _directory, receive, environment) => {
    if (this.receive) throw new Error("A replay owns exactly one provider process");
    this.receive = receive;
    this.launches.push({ args, ...(environment ? { environment } : {}) });
    this.pump();
    return this.process;
  };
  constructor(private readonly records: readonly ReplayRecord[]) {}
  private call(channel: string, message?: unknown, method?: string) {
    const done = deferred<Record<string, unknown>>();
    const call = {
      channel,
      ...(method ? { method } : {}),
      ...(message === undefined ? {} : { message }),
      done,
    };
    this.sent.push(call);
    this.calls.push(call);
    this.pump();
    return done.promise;
  }
  wait(name: string): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.records.some((record) => record.direction === "gate" && record.name === name))
      return Promise.reject(new Error("Unknown provider replay gate"));
    if (this.reached.has(name)) return Promise.resolve();
    let wait = this.waits.get(name);
    if (!wait) {
      wait = deferred<void>();
      this.waits.set(name, wait);
    }
    return wait.promise;
  }
  release(name: string) {
    this.released.add(name);
    this.pump();
  }
  get pending() {
    return {
      queued: this.calls.length,
      inFlight: this.inFlight,
      remaining: this.records.length - this.position,
    };
  }
  drain(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.position === this.records.length && !this.calls.length && !this.inFlight)
      return Promise.resolve();
    const drain = deferred<void>();
    this.drains.add(drain);
    return drain.promise;
  }
  /** Include asynchronous hook/approval delivery owned by the test in the drain boundary. */
  track<T>(operation: Promise<T>): Promise<T> {
    this.inFlight++;
    return operation.finally(() => {
      this.inFlight--;
      this.settleDrains();
    });
  }
  private settleDrains() {
    if (
      this.failure ||
      (this.position === this.records.length && !this.calls.length && !this.inFlight)
    ) {
      for (const drain of this.drains) {
        if (this.failure) drain.reject(this.failure);
        else drain.resolve();
      }
      this.drains.clear();
    }
  }
  private pump() {
    if (this.running || !this.receive || this.failure) return;
    this.running = true;
    this.inFlight++;
    void (async () => {
      try {
        while (this.position < this.records.length) {
          const record = this.records[this.position]!;
          if (record.direction === "gate") {
            this.reached.add(record.name);
            this.waits.get(record.name)?.resolve();
            if (!this.released.has(record.name)) return;
          } else if (record.direction === "host") {
            const call = this.calls.shift();
            if (!call) return;
            if (
              call.channel !== record.channel ||
              (record.method !== undefined && call.method !== record.method) ||
              (record.message !== undefined && !matches(call.message, record.message))
            ) {
              const error = new Error(`Provider replay mismatch at record ${this.position + 1}`);
              call.done.reject(error);
              throw error;
            }
            call.done.resolve(record.reply ?? {});
          } else if (record.direction === "provider") this.receive!(record.message);
          else this.exited.resolve(record.code);
          this.position++;
          // Let provider promise continuations enqueue their next protocol operation.
          await Promise.resolve();
        }
        if (this.calls.length)
          throw new Error(
            "Provider replay received unexpected host operations after its final record",
          );
      } catch (error) {
        this.failure = error instanceof Error ? error : new Error("Provider replay failed");
        for (const call of this.calls.splice(0)) call.done.reject(this.failure);
        for (const wait of this.waits.values()) wait.reject(this.failure);
      } finally {
        this.running = false;
        this.inFlight--;
        this.settleDrains();
      }
    })();
  }
}
