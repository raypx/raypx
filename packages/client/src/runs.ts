import { runEventSchema, runSnapshotSchema } from "@voidmix/contracts";
import type {
  AgentRunDto,
  RunArtifactDto,
  RunCommandDto,
  RunEventDto,
  RunSnapshotDto,
} from "@voidmix/contracts";
import { createApiClient, createStreamingApiClient, type CreateApiClientOptions } from "./index.js";
import { parseApiProblemDetails } from "./errors.js";

export type RunConnection = "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";
export interface RunSessionSnapshot {
  run: AgentRunDto | null;
  events: readonly RunEventDto[];
  commands: readonly RunCommandDto[];
  artifacts: readonly RunArtifactDto[];
  connection: RunConnection;
  error: { code: string } | null;
}
export interface RunTransport {
  snapshot(runId: string, signal: AbortSignal): Promise<RunSnapshotDto>;
  stream(runId: string, afterSeq: number, signal: AbortSignal): Promise<AsyncIterable<RunEventDto>>;
}
export interface RunSession {
  getSnapshot(): RunSessionSnapshot;
  subscribe(listener: () => void): () => void;
  reconnect(): void;
  dispose(): void;
}
export function createApiRunTransport(options: CreateApiClientOptions = {}): RunTransport {
  const reads = createApiClient(options);
  const streams = createStreamingApiClient(options);
  return {
    snapshot: (runId, signal) => reads.projects.agentRuns.snapshot({ runId }, { signal }),
    stream: (runId, afterSeq, signal) =>
      streams.projects.agentRuns.events.stream({ runId, afterSeq }, { signal }),
  };
}

const terminal = (run: AgentRunDto | null) =>
  !!run && ["succeeded", "failed", "cancelled"].includes(run.status);
function errorCode(error: unknown): string {
  const problem = parseApiProblemDetails(error);
  if (problem) return problem.code;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string")
    return error.code;
  return "RUN_STREAM_UNAVAILABLE";
}
function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** Construct without I/O. The owning mounted feature starts and disposes it. */
export function createRunSession(options: {
  runId: string;
  transport: RunTransport;
  initialSnapshot?: RunSnapshotDto;
  retryDelayMs?: number;
  commandRefreshMs?: number;
}): RunSession {
  const initial = options.initialSnapshot;
  if (initial && initial.run.id !== options.runId)
    throw new Error("Run snapshot belongs to another run.");
  let state: RunSessionSnapshot = {
    run: initial?.run ?? null,
    events: initial?.events ?? [],
    commands: initial?.commands ?? [],
    artifacts: initial?.artifacts ?? [],
    connection: "disconnected",
    error: null,
  };
  const listeners = new Set<() => void>();
  let controller: AbortController | null = null;
  let generation = 0;
  let disposed = false;
  const publish = (patch: Partial<RunSessionSnapshot>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const current = (epoch: number, signal: AbortSignal) =>
    !disposed && epoch === generation && !signal.aborted;
  const read = async (epoch: number, signal: AbortSignal) => {
    const snapshot = runSnapshotSchema.parse(
      await options.transport.snapshot(options.runId, signal),
    );
    if (snapshot.run.id !== options.runId)
      throw Object.assign(new Error("Wrong run scope."), { code: "RUN_SCOPE_MISMATCH" });
    if (!current(epoch, signal)) return;
    if (snapshot.run.lastSeq < (state.run?.lastSeq ?? 0)) return;
    publish({
      run: snapshot.run,
      events: snapshot.events,
      commands: snapshot.commands,
      artifacts: snapshot.artifacts,
      error: null,
    });
  };
  const accept = (raw: RunEventDto) => {
    const event = runEventSchema.parse(raw);
    if (event.runId !== options.runId)
      throw Object.assign(new Error("Wrong event scope."), { code: "RUN_SCOPE_MISMATCH" });
    const previous = state.run;
    if (!previous || event.seq <= previous.lastSeq) return;
    if (event.seq !== previous.lastSeq + 1)
      throw Object.assign(new Error("Missing run events."), { code: "RUN_EVENT_GAP" });
    let run = { ...previous, lastSeq: event.seq };
    if (event.type === "run.status")
      run = {
        ...run,
        status: event.payload.status,
        ...(event.payload.error !== undefined ? { error: event.payload.error } : {}),
        ...(event.payload.output !== undefined ? { output: event.payload.output } : {}),
        ...(["succeeded", "failed", "cancelled"].includes(event.payload.status)
          ? { completedAt: event.occurredAt }
          : {}),
      };
    if (event.type === "approval.requested")
      run = { ...run, pendingApprovalId: event.payload.approvalId };
    if (event.type === "approval.resolved") run = { ...run, pendingApprovalId: null };
    publish({ run, events: [...state.events, event], error: null });
  };
  const pollCommands = async (epoch: number, signal: AbortSignal) => {
    while (current(epoch, signal)) {
      await wait(options.commandRefreshMs ?? 2_000, signal);
      if (!current(epoch, signal)) return;
      if (state.commands.some((command) => command.status === "pending")) {
        try {
          await read(epoch, signal);
        } catch {
          /* The stream owns connection recovery. */
        }
      } else if (terminal(state.run)) return;
    }
  };
  const connect = async (epoch: number, signal: AbortSignal) => {
    let failures = 0;
    while (current(epoch, signal)) {
      try {
        await read(epoch, signal);
        if (!current(epoch, signal)) return;
        publish({ connection: "connected", error: null });
        if (terminal(state.run)) return;
        const events = await options.transport.stream(
          options.runId,
          state.run?.lastSeq ?? 0,
          signal,
        );
        for await (const event of events) {
          if (!current(epoch, signal)) return;
          accept(event);
          failures = 0;
        }
        if (!current(epoch, signal)) return;
        await read(epoch, signal);
        if (terminal(state.run)) return;
        throw Object.assign(new Error("Stream ended before the run."), {
          code: "RUN_STREAM_UNAVAILABLE",
        });
      } catch (error) {
        if (!current(epoch, signal)) return;
        const code = errorCode(error);
        if (
          [
            "UNAUTHORIZED",
            "FORBIDDEN",
            "NOT_FOUND",
            "RUN_SCOPE_MISMATCH",
            "PROJECT_ACCESS_DENIED",
            "DEVICE_REVOKED",
          ].includes(code)
        ) {
          publish({ connection: "failed", error: { code } });
          controller?.abort();
          return;
        }
        publish({ connection: "reconnecting", error: { code } });
        await wait(
          Math.min((options.retryDelayMs ?? 1_000) * 2 ** Math.min(failures++, 3), 8_000),
          signal,
        );
      }
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reconnect() {
      disposed = false;
      controller?.abort();
      controller = new AbortController();
      const epoch = ++generation;
      publish({ connection: state.run ? "reconnecting" : "connecting", error: null });
      void connect(epoch, controller.signal);
      void pollCommands(epoch, controller.signal);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      controller?.abort();
      state = { ...state, connection: "disconnected" };
    },
  };
}
