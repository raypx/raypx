import { parseApiProblemDetails } from "./errors.js";

export type SessionConnection =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";
export interface OrderedEvent {
  sequence: number;
}
export interface OrderedSnapshot<E> {
  cursor: number;
  events: readonly E[];
}
export interface SessionSnapshot<S> {
  data: S | null;
  connection: SessionConnection;
  error: { code: string } | null;
  refreshing: boolean;
  settled: boolean;
}
export interface OrderedTransport<S, E> {
  snapshot(signal: AbortSignal): Promise<S>;
  stream(cursor: number, signal: AbortSignal): Promise<AsyncIterable<E>>;
}
export interface ResourceSession<S> {
  getSnapshot(this: void): SessionSnapshot<S>;
  subscribe(this: void, listener: () => void): () => void;
  reconnect(this: void): void;
  refresh(this: void): void;
  dispose(this: void): void;
}

function errorCode(error: unknown): string {
  return (
    parseApiProblemDetails(error)?.code ??
    (error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "STREAM_UNAVAILABLE")
  );
}
function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Request-free construction. Every instance and reconnect owns an isolated abort scope. */
export function createOrderedSession<
  S extends OrderedSnapshot<E>,
  E extends OrderedEvent,
>(options: {
  transport: OrderedTransport<S, E>;
  validateSnapshot(snapshot: S): S;
  validateEvent(event: E): E;
  reduce(snapshot: S, event: E): S;
  isTerminal(snapshot: S): boolean;
  initialSnapshot?: S;
  retryDelayMs?: number;
  refreshTerminal?: boolean;
  refreshAfterEvent?: (event: E) => boolean;
}): ResourceSession<S> {
  let state: SessionSnapshot<S> = {
    data: options.initialSnapshot ? options.validateSnapshot(options.initialSnapshot) : null,
    connection: "disconnected",
    error: null,
    refreshing: false,
    settled: false,
  };
  let generation = 0;
  let controller: AbortController | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  let read: { epoch: number; promise: Promise<void> } | null = null;
  const publish = (patch: Partial<SessionSnapshot<S>>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const current = (epoch: number, signal: AbortSignal) =>
    !disposed && epoch === generation && !signal.aborted;
  const fatal = (code: string) =>
    [
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "RESOURCE_SCOPE_MISMATCH",
      "PROJECT_ACCESS_DENIED",
      "CLOUD_ACCESS_DENIED",
      "CLOUD_NOT_FOUND",
    ].includes(code);
  const revoked = (code: string) =>
    [
      "UNAUTHORIZED",
      "FORBIDDEN",
      "PROJECT_ACCESS_DENIED",
      "CLOUD_ACCESS_DENIED",
      "CLOUD_NOT_FOUND",
    ].includes(code);
  function readSnapshot(epoch: number, signal: AbortSignal): Promise<void> {
    if (read?.epoch === epoch) return read.promise;
    publish({ refreshing: true });
    const promise = (async () => {
      const data = options.validateSnapshot(await options.transport.snapshot(signal));
      if (!current(epoch, signal)) return;
      if (!state.data || data.cursor >= state.data.cursor)
        publish({ data, error: null, settled: options.isTerminal(data) });
    })().finally(() => {
      if (read?.promise === promise) read = null;
      if (current(epoch, signal)) publish({ refreshing: false });
    });
    read = { epoch, promise };
    return promise;
  }
  function refreshCurrent() {
    if (!controller || disposed) return;
    const epoch = generation;
    const signal = controller.signal;
    void readSnapshot(epoch, signal).catch((error) => {
      if (!current(epoch, signal)) return;
      const code = errorCode(error);
      publish({
        error: { code },
        ...(fatal(code) ? { connection: "failed" as const } : {}),
        ...(revoked(code) ? { data: null, settled: false } : {}),
      });
      if (fatal(code)) controller?.abort();
    });
  }
  async function connect(epoch: number, signal: AbortSignal) {
    let failures = 0;
    while (current(epoch, signal)) {
      try {
        await readSnapshot(epoch, signal);
        if (!current(epoch, signal)) return;
        publish({ connection: "connected", error: null });
        if (state.data && options.isTerminal(state.data) && state.settled) return;
        const stream = await options.transport.stream(state.data?.cursor ?? 0, signal);
        for await (const raw of stream) {
          if (!current(epoch, signal)) return;
          const event = options.validateEvent(raw);
          const previous = state.data;
          if (!previous || event.sequence <= previous.cursor) continue;
          if (event.sequence !== previous.cursor + 1) throw { code: "EVENT_GAP" };
          const next = options.reduce(previous, event);
          if (next.cursor !== event.sequence)
            throw new Error("Event reducer must advance the contiguous cursor.");
          publish({ data: next, connection: "connected", error: null, settled: false });
          failures = 0;
          if (options.isTerminal(next)) {
            if (options.refreshTerminal) {
              await readSnapshot(epoch, signal);
              if (current(epoch, signal) && !state.settled) await readSnapshot(epoch, signal);
            } else publish({ settled: true });
            if (!current(epoch, signal)) return;
            if (state.settled) return;
            throw { code: "EVENT_GAP" };
          }
          if (options.refreshAfterEvent?.(event)) refreshCurrent();
        }
        if (!current(epoch, signal)) return;
        if (state.data && options.isTerminal(state.data) && state.settled) return;
        throw { code: "STREAM_UNAVAILABLE" };
      } catch (error) {
        if (!current(epoch, signal)) return;
        const code = errorCode(error);
        if (fatal(code)) {
          publish({
            connection: "failed",
            error: { code },
            ...(revoked(code) ? { data: null, settled: false } : {}),
          });
          controller?.abort();
          return;
        }
        publish({ connection: "reconnecting", error: { code } });
        await pause(
          Math.min((options.retryDelayMs ?? 1000) * 2 ** Math.min(failures++, 3), 8000),
          signal,
        );
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh: refreshCurrent,
    reconnect() {
      disposed = false;
      controller?.abort();
      controller = new AbortController();
      const epoch = ++generation;
      publish({ connection: state.data ? "reconnecting" : "connecting", error: null });
      void connect(epoch, controller.signal);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      controller?.abort();
      publish({ connection: "disconnected", refreshing: false });
    },
  };
}
