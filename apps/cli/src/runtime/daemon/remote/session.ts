/**
 * `offline`: no usable relay stream. `ready`: the relay resumed the stream and
 * the journal is being replayed. `available`: the relay holds everything local.
 */
type RelayPhase = "offline" | "ready" | "available";

/** One device's relay connection lifecycle. Values are immutable; `relaySession` derives the next. */
export interface RelaySession {
  readonly phase: RelayPhase;
  /** A renewed grant is waiting for in-flight commands before it reconnects. */
  readonly draining: boolean;
  /** The binding is being released. */
  readonly detaching: boolean;
}

export type RelaySessionEvent =
  /** The connection was stopped or replaced. */
  | { type: "retired" }
  /** The socket closed; the same connection reconnects by itself. */
  | { type: "dropped" }
  /** The relay accepted the stream and named its cursor. */
  | { type: "resumed" }
  /** Every local event is checkpointed and acknowledged. */
  | { type: "caught_up" }
  | { type: "draining"; active: boolean }
  | { type: "detaching"; active: boolean };

export const initialRelaySession: RelaySession = {
  phase: "offline",
  draining: false,
  detaching: false,
};

type Transitions = {
  [Type in RelaySessionEvent["type"]]: (
    state: RelaySession,
    event: Extract<RelaySessionEvent, { type: Type }>,
  ) => RelaySession;
};

const transitions: Transitions = {
  retired: (state) => ({ ...state, phase: "offline" }),
  dropped: (state) => ({ ...state, phase: "offline" }),
  // A repeated resume on a live stream must not withdraw availability.
  resumed: (state) => (state.phase === "offline" ? { ...state, phase: "ready" } : state),
  // Availability is only reachable through a resumed stream.
  caught_up: (state) => (state.phase === "offline" ? state : { ...state, phase: "available" }),
  draining: (state, event) => ({ ...state, draining: event.active }),
  detaching: (state, event) => ({ ...state, detaching: event.active }),
};

export function relaySession(state: RelaySession, event: RelaySessionEvent): RelaySession {
  const transition = transitions[event.type] as (
    state: RelaySession,
    event: RelaySessionEvent,
  ) => RelaySession;
  return transition(state, event);
}

/** Commands are refused while their results could not be delivered on this connection. */
export const acceptsCommands = (state: RelaySession) => !state.draining && !state.detaching;
