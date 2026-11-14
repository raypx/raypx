import {
  MAX_COMPUTER_SCREEN_FPS,
  computerScreenFrameSchema,
  computerScreenInputSchema,
  type ComputerScreenControl,
  type ComputerScreenFrame,
  type ComputerScreenEvent,
  type ComputerScreenInput,
  type ComputerScreenState,
  type ComputerScreenCloseReason,
} from "@raypx/core/computers";
import type { SpaceScope } from "@raypx/spaces/server";
import { ComputerError, type ComputerProvider, type ComputerRef } from "@raypx/providers/computer";
import type { ComputersRepository } from "./server.js";

export const COMPUTER_SCREEN_CONTROL_TTL_MS = 30_000;
export class ComputerScreenError extends Error {
  constructor(
    readonly code:
      | "SCREEN_UNAVAILABLE"
      | "SCREEN_NOT_RUNNING"
      | "SCREEN_CONTROL_HELD"
      | "SCREEN_CONTROL_REQUIRED"
      | "SCREEN_OWNER_REQUIRED"
      | "SCREEN_INVALID_INPUT",
    readonly control: ComputerScreenControl | null = null,
  ) {
    super(code);
    this.name = "ComputerScreenError";
  }
}
export type ComputerScreenReleaseReason =
  | "released"
  | "forced"
  | "expired"
  | "disconnected"
  | "membership_lost"
  | "screen_stopped"
  | "computer_stopped";
export interface ComputerScreenRepository {
  openViewer(this: void, scope: SpaceScope, ref: ComputerRef, viewerId: string): Promise<void>;
  touchViewer(this: void, scope: SpaceScope, ref: ComputerRef, viewerId: string): Promise<void>;
  control(this: void, scope: SpaceScope, ref: ComputerRef): Promise<ComputerScreenControl | null>;
  acquire(
    this: void,
    scope: SpaceScope,
    ref: ComputerRef,
    viewerId: string,
  ): Promise<ComputerScreenControl>;
  renew(
    this: void,
    scope: SpaceScope,
    ref: ComputerRef,
    grantId: string,
  ): Promise<ComputerScreenControl>;
  release(this: void, scope: SpaceScope, ref: ComputerRef, grantId: string): Promise<void>;
  forceRelease(this: void, scope: SpaceScope, ref: ComputerRef): Promise<void>;
  releaseViewer(this: void, scope: SpaceScope, ref: ComputerRef, viewerId: string): Promise<void>;
  withMemberInput<T>(
    this: void,
    scope: SpaceScope,
    ref: ComputerRef,
    grantId: string,
    operation: () => Promise<T>,
  ): Promise<T>;
  withAgentInput<T>(
    this: void,
    scope: SpaceScope,
    ref: ComputerRef,
    operation: () => Promise<T>,
  ): Promise<T>;
  stop<T>(this: void, scope: SpaceScope, ref: ComputerRef, operation: () => Promise<T>): Promise<T>;
}
export interface ComputerScreenStreamOptions {
  viewerId: string;
  signal?: AbortSignal;
  /** Resolves both the session and current membership again, without retained authorization. */
  recheck: () => Promise<SpaceScope>;
}
export interface ComputerScreensService {
  availability(this: void, scope: SpaceScope): Promise<ComputerScreenState>;
  start(this: void, scope: SpaceScope): Promise<ComputerScreenState>;
  stop(this: void, scope: SpaceScope): Promise<ComputerScreenState>;
  acquire(this: void, scope: SpaceScope, viewerId: string): Promise<ComputerScreenState>;
  renew(this: void, scope: SpaceScope, grantId: string): Promise<ComputerScreenState>;
  release(this: void, scope: SpaceScope, grantId: string): Promise<ComputerScreenState>;
  forceRelease(this: void, scope: SpaceScope): Promise<ComputerScreenState>;
  input(
    this: void,
    scope: SpaceScope,
    grantId: string,
    input: ComputerScreenInput,
  ): Promise<ComputerScreenState>;
  stream(
    this: void,
    scope: SpaceScope,
    options: ComputerScreenStreamOptions,
  ): AsyncIterable<ComputerScreenEvent>;
  withAgentInput<T>(
    this: void,
    scope: SpaceScope,
    ref: ComputerRef,
    operation: () => Promise<T>,
  ): Promise<T>;
}
function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
function closeReason(error: unknown): ComputerScreenCloseReason {
  if (error && typeof error === "object") {
    const code = "code" in error ? error.code : undefined;
    if (code === "SCREEN_CONTROL_REQUIRED") return "SCREEN_IDLE_TIMEOUT";
    if (
      code === "SPACE_MEMBER_LEFT" ||
      code === "SPACE_MEMBER_REMOVED" ||
      code === "SPACE_DELETING" ||
      code === "SESSION_EXPIRED"
    )
      return code;
    const subscriptionReason =
      "subscriptionEndReason" in error ? error.subscriptionEndReason : undefined;
    if (
      subscriptionReason === "SPACE_MEMBER_LEFT" ||
      subscriptionReason === "SPACE_MEMBER_REMOVED" ||
      subscriptionReason === "SPACE_DELETING"
    )
      return subscriptionReason;
    const message = "message" in error ? error.message : undefined;
    if (message === "SESSION_EXPIRED") return "SESSION_EXPIRED";
  }
  return "ACCESS_DENIED";
}
/** Screen bytes stay in this request's bounded iterator; no persistence or logging. */
export function createComputerScreensService(
  computers: ComputersRepository,
  controls: ComputerScreenRepository,
  provider: ComputerProvider | null,
  options: {
    now?: () => number;
    recheckMs?: number;
    streamLifetimeMs?: number;
    frameIdleMs?: number;
  } = {},
): ComputerScreensService {
  const now = options.now ?? Date.now;
  const recheckMs = Math.min(options.recheckMs ?? 1_000, 5_000);
  const lifetimeMs = Math.min(options.streamLifetimeMs ?? 300_000, 300_000);
  const frameIdleMs = Math.min(options.frameIdleMs ?? 10_000, 10_000);
  async function reference(scope: SpaceScope) {
    const computer = await computers.get(scope);
    if (!computer || computer.state !== "running" || computer.leaseOwner)
      throw new ComputerScreenError("SCREEN_NOT_RUNNING");
    return { id: computer.id, generation: computer.generation };
  }
  function capable() {
    return (
      provider?.screen &&
      provider.startScreen &&
      provider.stopScreen &&
      provider.screenshot &&
      provider.input &&
      provider.streamScreen
    );
  }
  async function availability(scope: SpaceScope): Promise<ComputerScreenState> {
    if (!provider) return { status: "not-configured" };
    const computer = await computers.get(scope);
    if (!computer || computer.state !== "running" || computer.leaseOwner)
      return { status: "not-running", state: computer?.state ?? null };
    if (!capable()) return { status: "unavailable", code: "SCREEN_UNAVAILABLE" };
    const ref = { id: computer.id, generation: computer.generation };
    try {
      const screen = await provider.screen!(ref);
      if (!screen.available)
        return {
          status: "unavailable",
          code: "SCREEN_UNAVAILABLE",
          ...(screen.reason ? { reason: screen.reason } : {}),
        };
      const control = await controls.control(scope, ref);
      return {
        status: "available",
        running: screen.running,
        width: screen.width,
        height: screen.height,
        control,
        agentInputPaused: control !== null,
        canForceRelease: scope.member.role === "owner",
      };
    } catch (error) {
      if (error instanceof ComputerError)
        return { status: "unavailable", code: "COMPUTER_UNAVAILABLE" };
      throw error;
    }
  }
  async function availableRef(scope: SpaceScope) {
    if (!capable()) throw new ComputerScreenError("SCREEN_UNAVAILABLE");
    return reference(scope);
  }
  async function runningRef(scope: SpaceScope) {
    const ref = await availableRef(scope);
    const screen = await provider!.screen!(ref);
    if (!screen.available) throw new ComputerScreenError("SCREEN_UNAVAILABLE");
    if (!screen.running) throw new ComputerScreenError("SCREEN_NOT_RUNNING");
    return ref;
  }
  return {
    availability,
    async start(scope) {
      await provider?.startScreen?.(await availableRef(scope));
      return availability(scope);
    },
    async stop(scope) {
      const ref = await availableRef(scope);
      await controls.stop(scope, ref, () => provider!.stopScreen!(ref));
      return availability(scope);
    },
    async acquire(scope, viewerId) {
      if (!/^[a-f0-9-]{36}$/i.test(viewerId)) throw new ComputerScreenError("SCREEN_INVALID_INPUT");
      await controls.acquire(scope, await runningRef(scope), viewerId);
      return availability(scope);
    },
    async renew(scope, grantId) {
      await controls.renew(scope, await runningRef(scope), grantId);
      return availability(scope);
    },
    async release(scope, grantId) {
      await controls.release(scope, await availableRef(scope), grantId);
      return availability(scope);
    },
    async forceRelease(scope) {
      await controls.forceRelease(scope, await availableRef(scope));
      return availability(scope);
    },
    async input(scope, grantId, input) {
      const parsed = computerScreenInputSchema.safeParse(input);
      if (!parsed.success) throw new ComputerScreenError("SCREEN_INVALID_INPUT");
      const ref = await runningRef(scope);
      await controls.withMemberInput(scope, ref, grantId, () => provider!.input!(ref, parsed.data));
      return availability(scope);
    },
    withAgentInput: (scope, ref, operation) => controls.withAgentInput(scope, ref, operation),
    async *stream(initial, settings) {
      let scope = initial;
      const ref = await runningRef(scope);
      if (!/^[a-f0-9-]{36}$/i.test(settings.viewerId))
        throw new ComputerScreenError("SCREEN_INVALID_INPUT");
      await controls.openViewer(scope, ref, settings.viewerId);
      const abort = new AbortController();
      const externalAbort = () => abort.abort();
      settings.signal?.addEventListener("abort", externalAbort, { once: true });
      if (settings.signal?.aborted) abort.abort();
      let iterator: AsyncIterator<ComputerScreenFrame> | undefined;
      const started = now();
      let lastFrame = started;
      let lastCheck = -Infinity;
      let terminal: ComputerScreenCloseReason | null = null;
      async function refreshScope() {
        try {
          const fresh = await settings.recheck();
          if (
            fresh.spaceId !== initial.spaceId ||
            fresh.member.accountId !== initial.member.accountId
          )
            throw new Error("ACCESS_DENIED");
          scope = fresh;
          return true;
        } catch (error) {
          terminal = closeReason(error);
          return false;
        }
      }
      try {
        const iterable = provider!.streamScreen!(ref, { signal: abort.signal });
        iterator = iterable[Symbol.asyncIterator]();
        let pending = iterator.next();
        void pending.catch(() => undefined);
        while (!abort.signal.aborted) {
          aborted(abort.signal);
          if (now() - started >= lifetimeMs) {
            terminal = "SCREEN_STREAM_EXPIRED";
            break;
          }
          if (now() - lastCheck >= recheckMs) {
            if (!(await refreshScope())) break;
            lastCheck = now();
            const state = await availability(scope);
            yield { kind: "state", state };
            if (state.status !== "available" || !state.running) {
              terminal = "SCREEN_STOPPED";
              break;
            }
            try {
              await controls.touchViewer(scope, ref, settings.viewerId);
            } catch (error) {
              if (
                error instanceof ComputerScreenError &&
                (error.code === "SCREEN_CONTROL_REQUIRED" || error.code === "SCREEN_NOT_RUNNING")
              ) {
                // Stop removes the viewer while the provider is shutting down.
                // Observe that transition before classifying a missing heartbeat
                // as an idle view, including a stop racing this status read.
                if (!(await refreshScope())) break;
                const latest = await availability(scope);
                yield { kind: "state", state: latest };
                terminal =
                  latest.status !== "available" || !latest.running
                    ? "SCREEN_STOPPED"
                    : closeReason(error);
              } else terminal = closeReason(error);
              break;
            }
          }
          const next = await Promise.race([
            pending.then((value) => ({ type: "frame" as const, value })),
            delay(Math.min(recheckMs, 250), abort.signal).then(() => ({ type: "tick" as const })),
          ]);
          if (next.type === "tick") {
            if (now() - lastFrame >= frameIdleMs) {
              terminal = "SCREEN_IDLE_TIMEOUT";
              break;
            }
            continue;
          }
          if (next.value.done) {
            if (!(await refreshScope())) break;
            yield { kind: "state", state: await availability(scope) };
            terminal = "SCREEN_STOPPED";
            break;
          }
          const frame = computerScreenFrameSchema.parse(next.value.value);
          lastFrame = now();
          yield { kind: "frame", frame };
          await delay(1_000 / MAX_COMPUTER_SCREEN_FPS, abort.signal);
          pending = iterator.next();
          void pending.catch(() => undefined);
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          if (error && typeof error === "object" && "subscriptionEndReason" in error)
            terminal = closeReason(error);
          else if (error instanceof ComputerError && error.code === "NOT_RUNNING")
            terminal = "SCREEN_STOPPED";
          else terminal = "SCREEN_UNAVAILABLE";
        }
      } finally {
        abort.abort();
        settings.signal?.removeEventListener("abort", externalAbort);
        // Exact viewer binding makes closing a second tab harmless to the controller.
        await controls.releaseViewer(initial, ref, settings.viewerId);
        // An adapter ignoring abort must not keep a disconnected API request alive.
        if (iterator?.return) {
          const timeout = new AbortController();
          await Promise.race([
            iterator.return().catch(() => undefined),
            delay(1_000, timeout.signal),
          ]);
          timeout.abort();
        }
      }
      if (terminal) yield { kind: "closed", reason: terminal };
    },
  };
}
