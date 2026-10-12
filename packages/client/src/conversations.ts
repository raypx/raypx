import { cloudConversationSnapshotSchema } from "@voidmix/contracts";
import type { CloudConversationSnapshotDto, CloudRunDto, CloudTurnDto } from "@voidmix/contracts";
import { createApiClient, createStreamingApiClient, type CreateApiClientOptions } from "./index.js";
import { parseApiProblemDetails } from "./errors.js";
import type { ResourceSession, SessionSnapshot } from "./ordered-session.js";

export interface ConversationHistoryPage {
  items: CloudTurnDto[];
  runs: CloudRunDto[];
  nextCursor: string | null;
}
export interface ConversationTransport {
  snapshot(signal: AbortSignal): Promise<CloudConversationSnapshotDto>;
  stream(signal: AbortSignal): Promise<AsyncIterable<CloudConversationSnapshotDto>>;
  history(cursor: string, signal: AbortSignal): Promise<ConversationHistoryPage>;
}
export interface ConversationSessionState extends SessionSnapshot<CloudConversationSnapshotDto> {
  historyLoading: boolean;
  historyError: { code: string } | null;
}
export interface ConversationSession extends ResourceSession<CloudConversationSnapshotDto> {
  getSnapshot(this: void): ConversationSessionState;
  loadHistory(this: void): Promise<void>;
}
export function createConversationTransport(
  conversationId: string,
  options: CreateApiClientOptions = {},
): ConversationTransport {
  const reads = createApiClient(options);
  const streams = createStreamingApiClient(options);
  return {
    snapshot: (signal) => reads.cloud.conversations.snapshot({ conversationId }, { signal }),
    stream: (signal) => streams.cloud.conversations.stream({ conversationId }, { signal }),
    history: (cursor, signal) =>
      reads.cloud.conversations.history({ conversationId, cursor, limit: 100 }, { signal }),
  };
}
function revision(data: CloudConversationSnapshotDto): string {
  return `${data.conversation.updatedAt.valueOf()}:${data.historyCursor}:${data.turns.map((turn) => turn.id).join(",")}:${data.runs.map((run) => `${run.id}:${run.lastSequence}:${run.status}:${run.cancelRequested}`).join(",")}`;
}
function codeOf(error: unknown): string {
  return (
    parseApiProblemDetails(error)?.code ??
    (error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "STREAM_UNAVAILABLE")
  );
}
function fatal(code: string) {
  return [
    "UNAUTHORIZED",
    "FORBIDDEN",
    "CLOUD_ACCESS_DENIED",
    "CLOUD_NOT_FOUND",
    "RESOURCE_SCOPE_MISMATCH",
  ].includes(code);
}
function merge<T extends { id: string; createdAt: Date }>(
  previous: readonly T[],
  next: readonly T[],
): T[] {
  return [...new Map([...previous, ...next].map((item) => [item.id, item])).values()].sort(
    (a, b) => a.createdAt.valueOf() - b.createdAt.valueOf() || a.id.localeCompare(b.id),
  );
}
/** Conversation streams carry durable recent projections. Explicit history pages remain in the same resource-scoped store. */
export function createConversationSession(options: {
  conversationId: string;
  transport: ConversationTransport;
  initialSnapshot?: CloudConversationSnapshotDto;
  retryDelayMs?: number;
}): ConversationSession {
  function validate(raw: CloudConversationSnapshotDto) {
    const data = cloudConversationSnapshotSchema.parse(raw);
    const scope = JSON.stringify(data.conversation.scope);
    if (
      data.conversation.id !== options.conversationId ||
      data.turns.some(
        (turn) =>
          turn.conversationId !== options.conversationId || JSON.stringify(turn.scope) !== scope,
      ) ||
      data.runs.some(
        (run) =>
          run.conversationId !== options.conversationId || JSON.stringify(run.scope) !== scope,
      )
    )
      throw { code: "RESOURCE_SCOPE_MISMATCH" };
    return data;
  }
  let state: ConversationSessionState = {
    data: options.initialSnapshot ? validate(options.initialSnapshot) : null,
    connection: "disconnected",
    error: null,
    refreshing: false,
    settled: false,
    historyLoading: false,
    historyError: null,
  };
  let controller: AbortController | null = null;
  let historyController: AbortController | null = null;
  let generation = 0;
  let disposed = false;
  let historyStarted = false;
  let bootstrapAvailable = Boolean(options.initialSnapshot);
  let reading: { epoch: number; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const current = (epoch: number, signal: AbortSignal) =>
    !disposed && epoch === generation && !signal.aborted;
  const currentHistory = (request: AbortController) =>
    !disposed && historyController === request && !request.signal.aborted;
  const accept = (raw: CloudConversationSnapshotDto) => {
    const data = validate(raw);
    if (
      state.data &&
      JSON.stringify(data.conversation.scope) !== JSON.stringify(state.data.conversation.scope)
    )
      throw { code: "RESOURCE_SCOPE_MISMATCH" };
    // Runs that leave the recent window are expected; overlapping projections never move backwards.
    if (
      state.data &&
      state.data.runs.some((run) => {
        const next = data.runs.find((r) => r.id === run.id);
        return next && next.lastSequence < run.lastSequence;
      })
    )
      return;
    const next = state.data
      ? {
          ...data,
          turns: merge(state.data.turns, data.turns),
          runs: merge(state.data.runs, data.runs),
          historyCursor: historyStarted ? state.data.historyCursor : data.historyCursor,
        }
      : data;
    if (state.data && revision(next) === revision(state.data)) return;
    publish({ data: next });
  };
  function read(epoch: number, signal: AbortSignal): Promise<void> {
    if (reading?.epoch === epoch) return reading.promise;
    publish({ refreshing: true });
    const promise = options.transport
      .snapshot(signal)
      .then((data) => {
        if (current(epoch, signal)) {
          accept(data);
          publish({ error: null });
        }
      })
      .finally(() => {
        if (reading?.promise === promise) reading = null;
        if (current(epoch, signal)) publish({ refreshing: false });
      });
    reading = { epoch, promise };
    return promise;
  }
  function fail(code: string) {
    publish({
      error: { code },
      ...(fatal(code) ? { connection: "failed" as const, historyLoading: false } : {}),
      ...(["UNAUTHORIZED", "FORBIDDEN", "CLOUD_ACCESS_DENIED", "CLOUD_NOT_FOUND"].includes(code)
        ? { data: null }
        : {}),
    });
    if (fatal(code)) {
      controller?.abort();
      historyController?.abort();
    }
  }
  async function connect(epoch: number, signal: AbortSignal) {
    while (current(epoch, signal)) {
      try {
        // The stream starts with an authorized fresh projection. Reuse the Router bootstrap once.
        if (bootstrapAvailable) bootstrapAvailable = false;
        else await read(epoch, signal);
        if (!current(epoch, signal)) return;
        publish({ connection: "connected", error: null });
        const stream = await options.transport.stream(signal);
        for await (const item of stream) {
          if (!current(epoch, signal)) return;
          accept(item);
        }
        if (!current(epoch, signal)) return;
        throw { code: "STREAM_UNAVAILABLE" };
      } catch (error) {
        if (!current(epoch, signal)) return;
        const code = codeOf(error);
        if (fatal(code)) {
          fail(code);
          return;
        }
        publish({ connection: "reconnecting", error: { code } });
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, options.retryDelayMs ?? 1000);
          signal.addEventListener("abort", done, { once: true });
        });
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
    refresh() {
      if (!controller || disposed) return;
      const epoch = generation;
      const signal = controller.signal;
      void read(epoch, signal).catch((error) => {
        if (current(epoch, signal)) fail(codeOf(error));
      });
    },
    async loadHistory() {
      const cursor = state.data?.historyCursor;
      if (disposed || state.historyLoading || !cursor || !state.data) return;
      historyController?.abort();
      const request = new AbortController();
      historyController = request;
      publish({ historyLoading: true, historyError: null });
      try {
        const page = await options.transport.history(cursor, request.signal);
        if (!currentHistory(request) || !state.data) return;
        const validated = validate({
          conversation: state.data.conversation,
          turns: page.items,
          runs: page.runs,
          historyCursor: page.nextCursor,
        });
        const runs = merge(validated.runs, state.data.runs);
        historyStarted = true;
        publish({
          data: {
            ...state.data,
            turns: merge(state.data.turns, validated.turns),
            runs,
            historyCursor: page.nextCursor,
          },
        });
      } catch (error) {
        if (!currentHistory(request)) return;
        const code = codeOf(error);
        publish({
          historyError: { code },
          ...(fatal(code) ? { connection: "failed" as const, error: { code } } : {}),
        });
        if (fatal(code)) controller?.abort();
      } finally {
        if (currentHistory(request)) publish({ historyLoading: false });
      }
    },
    reconnect() {
      disposed = false;
      controller?.abort();
      controller = new AbortController();
      const epoch = ++generation;
      publish({
        connection: state.data ? "reconnecting" : "connecting",
        error: null,
      });
      void connect(epoch, controller.signal);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      controller?.abort();
      historyController?.abort();
      publish({ connection: "disconnected", historyLoading: false, refreshing: false });
    },
  };
}
