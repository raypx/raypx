import {
  cloudRunEventSchema,
  cloudRunSnapshotSchema,
  cloudSourceEvidenceSchema,
  cloudAssetVersionSchema,
} from "@voidmix/contracts";
import type { CloudRunEventDto, CloudRunSnapshotDto } from "@voidmix/contracts";
import { createApiClient, createStreamingApiClient, type CreateApiClientOptions } from "./index.js";
import { parseApiProblemDetails } from "./errors.js";
import {
  createOrderedSession,
  type OrderedTransport,
  type ResourceSession,
  type SessionSnapshot,
} from "./ordered-session.js";

export interface CloudRunTransport extends OrderedTransport<CloudRunSnapshotDto, CloudRunEventDto> {
  history?(
    beforeSequence: number,
    signal: AbortSignal,
  ): Promise<{ items: CloudRunEventDto[]; hasMore: boolean }>;
}
export interface CloudRunSessionState extends SessionSnapshot<CloudRunSnapshotDto> {
  historyLoading: boolean;
  historyError: { code: string } | null;
}
export interface CloudRunSession extends ResourceSession<CloudRunSnapshotDto> {
  getSnapshot(this: void): CloudRunSessionState;
  loadHistory(this: void): Promise<void>;
}
const terminal = (snapshot: CloudRunSnapshotDto) =>
  ["needs_input", "succeeded", "failed", "cancelled"].includes(snapshot.run.status);
export function createCloudRunTransport(
  runId: string,
  options: CreateApiClientOptions = {},
): CloudRunTransport {
  const reads = createApiClient(options);
  const streams = createStreamingApiClient(options);
  return {
    snapshot: (signal) => reads.cloud.runs.snapshot({ runId }, { signal }),
    stream: (afterSequence, signal) =>
      streams.cloud.runs.stream({ runId, afterSequence }, { signal }),
    history: (beforeSequence, signal) =>
      reads.cloud.runs.history({ runId, beforeSequence, limit: 200 }, { signal }),
  };
}
export function createCloudRunSession(options: {
  runId: string;
  transport: CloudRunTransport;
  initialSnapshot?: CloudRunSnapshotDto;
  retryDelayMs?: number;
}): CloudRunSession {
  const core = createOrderedSession({
    ...options,
    validateSnapshot(raw) {
      const data = cloudRunSnapshotSchema.parse(raw);
      if (
        data.run.id !== options.runId ||
        data.events.some((event) => event.runId !== options.runId) ||
        [...data.executions, ...data.sources, ...data.artifacts, ...data.commands].some(
          (item) =>
            item.runId !== options.runId ||
            JSON.stringify(item.scope) !== JSON.stringify(data.run.scope),
        )
      )
        throw { code: "RESOURCE_SCOPE_MISMATCH" };
      return data;
    },
    validateEvent(raw) {
      const event = cloudRunEventSchema.parse(raw);
      if (event.runId !== options.runId) throw { code: "RESOURCE_SCOPE_MISMATCH" };
      return event;
    },
    isTerminal: terminal,
    refreshTerminal: true,
    refreshAfterEvent: (event) =>
      ["artifact.published", "execution.started", "execution.completed"].includes(event.type),
    reduce(snapshot, event) {
      let run = { ...snapshot.run, lastSequence: event.sequence, updatedAt: event.occurredAt };
      if (event.type === "run.status") {
        const status = event.payload.status;
        if (
          status === "queued" ||
          status === "running" ||
          status === "needs_input" ||
          status === "succeeded" ||
          status === "failed" ||
          status === "cancelled"
        )
          run = {
            ...run,
            status,
            ...(typeof event.payload.output === "string" ? { output: event.payload.output } : {}),
            ...(typeof event.payload.error === "string" ? { error: event.payload.error } : {}),
            ...(["needs_input", "succeeded", "failed", "cancelled"].includes(status)
              ? { completedAt: event.occurredAt }
              : {}),
          };
      }
      const source =
        event.type === "source.created"
          ? cloudSourceEvidenceSchema.safeParse(
              event.payload.source ?? {
                ...event.payload,
                scope: run.scope,
                runId: run.id,
                createdAt: event.occurredAt,
                updatedAt: event.occurredAt,
              },
            )
          : null;
      const artifact =
        event.type === "artifact.published"
          ? cloudAssetVersionSchema.safeParse(event.payload.artifact)
          : null;
      let messages = snapshot.messages;
      if (
        (event.type === "message.delta" || event.type === "message.completed") &&
        typeof event.payload.text === "string"
      ) {
        const messageId =
          typeof event.payload.messageId === "string"
            ? event.payload.messageId
            : `${event.executionId ?? "root"}:message`;
        const previous = messages.find((message) => message.messageId === messageId);
        const next = {
          id: previous?.id ?? `${run.id}:${messageId}`,
          scope: run.scope,
          runId: run.id,
          createdAt: previous?.createdAt ?? event.occurredAt,
          updatedAt: event.occurredAt,
          sequence: event.sequence,
          messageId,
          executionId: event.executionId,
          text:
            event.type === "message.completed"
              ? event.payload.text
              : `${previous?.text ?? ""}${event.payload.text}`,
          completed: event.type === "message.completed",
        };
        messages = previous
          ? messages.map((message) => (message.messageId === messageId ? next : message))
          : [...messages, next];
      }
      const events = [...snapshot.events, event].slice(-200);
      return {
        ...snapshot,
        run,
        cursor: event.sequence,
        events,
        messages,
        historyCursor:
          snapshot.events.length >= 200 ? (events[0]?.sequence ?? null) : snapshot.historyCursor,
        historyTruncated: snapshot.historyTruncated || snapshot.events.length >= 200,
        ...(source?.success
          ? { sources: [...snapshot.sources.filter((s) => s.id !== source.data.id), source.data] }
          : {}),
        ...(artifact?.success
          ? {
              artifacts: [
                ...snapshot.artifacts.filter((a) => a.id !== artifact.data.id),
                artifact.data,
              ],
            }
          : {}),
      };
    },
  });
  let older: CloudRunEventDto[] = [];
  let historyStarted = false;
  let historyCursor: number | null = null;
  let historyLoading = false;
  let historyError: { code: string } | null = null;
  let request: AbortController | null = null;
  let disposed = false;
  let denial: { code: string } | null = null;
  let cachedCore: SessionSnapshot<CloudRunSnapshotDto> | null = null;
  let cached: CloudRunSessionState;
  let cachedDataSource: CloudRunSnapshotDto | null = null;
  let cachedData: CloudRunSnapshotDto | null = null;
  let historyVersion = 0;
  let projectedHistoryVersion = -1;
  const listeners = new Set<() => void>();
  const changed = () => {
    cachedCore = null;
    for (const listener of listeners) listener();
  };
  core.subscribe(() => {
    if (core.getSnapshot().connection === "connected") denial = null;
    changed();
  });
  const getSnapshot = () => {
    const current = core.getSnapshot();
    if (cachedCore === current) return cached;
    cachedCore = current;
    if (current.data !== cachedDataSource || projectedHistoryVersion !== historyVersion) {
      cachedDataSource = current.data;
      projectedHistoryVersion = historyVersion;
      if (current.data && historyStarted) {
        const events = [
          ...new Map(
            [...older, ...current.data.events].map((event) => [event.sequence, event]),
          ).values(),
        ].sort((a, b) => a.sequence - b.sequence);
        let cursor = historyCursor;
        // A moving live window can leave gaps between loaded pages. Backfill the newest gap first.
        for (let index = events.length - 1; index > 0; index--) {
          if (events[index]!.sequence > events[index - 1]!.sequence + 1) {
            cursor = events[index]!.sequence;
            break;
          }
        }
        cachedData = { ...current.data, historyCursor: cursor, events };
      } else cachedData = current.data;
    }
    cached = {
      ...current,
      historyLoading,
      historyError,
      data: cachedData,
      ...(denial ? { data: null, connection: "failed" as const, error: denial } : {}),
    };
    return cached;
  };
  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh: core.refresh,
    reconnect() {
      disposed = false;
      core.reconnect();
    },
    dispose() {
      disposed = true;
      request?.abort();
      historyLoading = false;
      core.dispose();
      changed();
    },
    async loadHistory() {
      const cursor = getSnapshot().data?.historyCursor;
      if (disposed || !cursor || historyLoading || !options.transport.history) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      historyLoading = true;
      historyError = null;
      changed();
      try {
        const page = await options.transport.history(cursor, controller.signal);
        if (disposed || controller.signal.aborted || request !== controller) return;
        const events = page.items.map((event) => cloudRunEventSchema.parse(event));
        if (
          events.some((event) => event.runId !== options.runId || event.sequence >= cursor) ||
          (page.hasMore && !events.length)
        )
          throw { code: "HISTORY_CURSOR_INVALID" };
        older = [
          ...new Map([...events, ...older].map((event) => [event.sequence, event])).values(),
        ];
        historyCursor = page.hasMore
          ? historyStarted && historyCursor === null
            ? null
            : Math.min(historyCursor ?? Number.POSITIVE_INFINITY, events[0]!.sequence)
          : null;
        historyStarted = true;
        historyVersion++;
      } catch (error) {
        if (!controller.signal.aborted) {
          const code =
            parseApiProblemDetails(error)?.code ??
            (error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "HISTORY_UNAVAILABLE");
          historyError = { code };
          if (
            ["UNAUTHORIZED", "FORBIDDEN", "CLOUD_ACCESS_DENIED", "CLOUD_NOT_FOUND"].includes(code)
          ) {
            denial = { code };
            core.dispose();
          }
        }
      } finally {
        if (!controller.signal.aborted && request === controller) {
          historyLoading = false;
          changed();
        }
      }
    },
  };
}
export { createCloudRunSession as createRunSession };
