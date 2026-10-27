import {
  TERMINAL_DEFAULT_WAIT_SECONDS,
  TERMINAL_MAX_WAIT_SECONDS,
  terminalDecisionSchema,
  terminalRequestSchema,
  type TerminalDecision,
  type TerminalRequest,
} from "@raypx/contracts/terminal";
import { validDecision, type HumanDecision } from "@raypx/contracts/tasks";
import { LocalError } from "../errors";

export type FallbackReason = "away_off" | "unavailable" | "expired" | "disconnected" | "stopped";
export type HookOutcome =
  | { type: "decision"; decision: HumanDecision }
  | { type: "fallback"; reason: FallbackReason };
export type DecisionReceipt = { input: TerminalDecision; request: TerminalRequest };
export interface BrokerStore {
  requests(): TerminalRequest[];
  receipt(id: string): DecisionReceipt | undefined;
  save(request: TerminalRequest, receipt?: DecisionReceipt): void;
  remove(id: string): void;
}
type Pending = { resolve(outcome: HookOutcome): void; timer: ReturnType<typeof setTimeout> };
type OpenRequest = Pick<
  TerminalRequest,
  "sessionId" | "provider" | "kind" | "title" | "body" | "questions"
>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Serializes decisions synchronously; a save must commit before a hook is released. */
export class RequestBroker {
  readonly epoch = crypto.randomUUID();
  private readonly records = new Map<string, TerminalRequest>();
  private readonly pending = new Map<string, Pending>();
  private closed = false;
  constructor(
    private readonly store: BrokerStore,
    private readonly changed: (request: TerminalRequest) => void = () => {},
    private readonly clock: () => number = Date.now,
  ) {
    for (const stored of store.requests()) {
      let request = terminalRequestSchema.parse(stored);
      if (["pending", "decided", "delivered"].includes(request.status)) {
        request = {
          ...request,
          revision: request.revision + 1,
          status: request.status === "pending" ? "cancelled" : "outcome_unknown",
        };
        store.save(request);
      }
      this.records.set(request.id, request);
    }
  }
  list(limit = 100) {
    return structuredClone([...this.records.values()].slice(-Math.min(256, limit)));
  }
  pendingRequests() {
    return [...this.pending.keys()].flatMap((id) => {
      const request = this.records.get(id);
      return request ? [structuredClone(request)] : [];
    });
  }
  get(id: string) {
    const request = this.records.get(id);
    return request ? structuredClone(request) : undefined;
  }
  private publish(request: TerminalRequest, receipt?: DecisionReceipt) {
    this.store.save(request, receipt);
    this.records.set(request.id, request);
  }
  private notify(request: TerminalRequest) {
    // Observers cannot roll back an already committed decision or strand its waiter.
    try {
      this.changed(structuredClone(request));
    } catch {
      /* Delivery can recover by reading state. */
    }
  }
  open(
    input: OpenRequest,
    options: {
      away: boolean;
      reachable: boolean;
      waitSeconds?: number;
      signal?: AbortSignal;
      admitted?: (request: TerminalRequest) => void;
    },
  ) {
    if (this.closed || !options.away || !options.reachable || options.signal?.aborted) {
      const reason: FallbackReason = this.closed
        ? "stopped"
        : !options.away
          ? "away_off"
          : options.signal?.aborted
            ? "disconnected"
            : "unavailable";
      return {
        request: undefined,
        outcome: Promise.resolve<HookOutcome>({ type: "fallback", reason }),
      };
    }
    const wait = options.waitSeconds ?? TERMINAL_DEFAULT_WAIT_SECONDS;
    if (!Number.isInteger(wait) || wait < 60 || wait > TERMINAL_MAX_WAIT_SECONDS)
      throw new LocalError("INVALID_WAIT", "Away wait must be between 60 and 600 seconds");
    if (this.records.size >= 256) {
      const oldest = [...this.records.values()].find(
        (value) => !["pending", "decided"].includes(value.status),
      );
      if (oldest) {
        this.store.remove(oldest.id);
        this.records.delete(oldest.id);
      }
    }
    if (this.pending.size >= 64 || this.records.size >= 256)
      throw new LocalError(
        "TOO_MANY_REQUESTS",
        "Terminal prototype capacity reached; use the native approval flow",
      );
    const now = this.clock();
    const request = terminalRequestSchema.parse({
      ...input,
      version: 1,
      id: crypto.randomUUID(),
      invocationId: crypto.randomUUID(),
      epoch: this.epoch,
      revision: 1,
      encoding: "plain",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + wait * 1000).toISOString(),
      status: "pending",
      decision: null,
    });
    if (Buffer.byteLength(JSON.stringify(request)) > 192 * 1024)
      throw new LocalError("TOO_LARGE", "Terminal request exceeds 192 KiB");
    // Persist before making the request visible or adding a waiter.
    this.store.save(request);
    this.records.set(request.id, request);
    let abort = () => {};
    const outcome = new Promise<HookOutcome>((resolve) => {
      const timer = setTimeout(() => {
        try {
          this.cancel(request.id, "expired");
        } catch {
          /* The waiter has already fallen back. */
        }
      }, wait * 1000);
      this.pending.set(request.id, { timer, resolve });
      abort = () => {
        try {
          this.cancel(request.id, "disconnected");
        } catch {
          /* Cancellation releases the waiter even if persistence is unavailable. */
        }
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
    }).finally(() => options.signal?.removeEventListener("abort", abort));
    options.admitted?.(structuredClone(request));
    if (this.pending.has(request.id)) this.notify(request);
    return { request: structuredClone(request), outcome };
  }
  decide(raw: unknown): TerminalRequest {
    const input = terminalDecisionSchema.parse(raw);
    const previous = this.store.receipt(input.receiptId);
    if (previous) {
      if (canonical(previous.input) !== canonical(input))
        throw new LocalError("RECEIPT_CONFLICT", "Receipt belongs to another decision");
      return this.get(input.id) ?? structuredClone(previous.request);
    }
    const request = this.records.get(input.id);
    if (
      !request ||
      request.epoch !== input.epoch ||
      request.revision !== input.revision ||
      request.status !== "pending" ||
      !this.pending.has(input.id)
    )
      throw new LocalError("STALE_REQUEST", "Terminal request is no longer pending");
    if (Date.parse(request.expiresAt) <= this.clock()) {
      this.cancel(request.id, "expired");
      throw new LocalError("STALE_REQUEST", "Terminal request expired");
    }
    if (!validDecision(request, input.decision))
      throw new LocalError("INVALID_DECISION", "Decision does not match the request");
    const next: TerminalRequest = {
      ...request,
      revision: request.revision + 1,
      status: "decided",
      decision: input.decision,
    };
    this.publish(next, { input, request: next });
    const pending = this.pending.get(input.id)!;
    this.pending.delete(input.id);
    clearTimeout(pending.timer);
    pending.resolve({ type: "decision", decision: input.decision });
    this.notify(next);
    return structuredClone(next);
  }
  delivered(id: string, epoch: string) {
    const request = this.records.get(id);
    if (!request || request.epoch !== epoch || request.status !== "decided") return false;
    const next: TerminalRequest = {
      ...request,
      revision: request.revision + 1,
      status: "delivered",
    };
    this.publish(next);
    this.notify(next);
    return true;
  }
  cancel(id: string, reason: FallbackReason) {
    const request = this.records.get(id),
      pending = this.pending.get(id);
    if (!request || !pending || request.status !== "pending") return false;
    const next: TerminalRequest = {
      ...request,
      revision: request.revision + 1,
      status: reason === "expired" ? "expired" : "cancelled",
    };
    try {
      this.publish(next);
    } finally {
      this.records.set(id, next);
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.resolve({ type: "fallback", reason });
      this.notify(next);
    }
    return true;
  }
  withdraw(reason: FallbackReason) {
    let failed = false;
    for (const id of this.pending.keys()) {
      try {
        this.cancel(id, reason);
      } catch {
        failed = true;
      }
    }
    if (failed)
      throw new LocalError(
        "PERSISTENCE_FAILED",
        "Terminal shutdown could not persist every request",
      );
  }
  close(reason: FallbackReason = "stopped") {
    this.closed = true;
    this.withdraw(reason);
  }
}
