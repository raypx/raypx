import type { HostBinding } from "./vault.ts";

/** What the daemon knows about its single cloud binding. Values are immutable; `hostState` derives the next. */
export interface HostState {
  /** The one origin/account binding this daemon serves. */
  readonly binding: HostBinding | undefined;
  /** Whether the binding's credential survives a daemon restart. */
  readonly persistent: boolean;
  /** Whether the relay acknowledged the opening observed batch of the current stream. */
  readonly observedSynced: boolean;
  readonly closing: boolean;
}

export type HostEvent =
  /** Callers confirm the daemon is open and the selection unchanged before binding. */
  | { type: "bound"; binding: HostBinding; persistent: boolean }
  | { type: "unbound" }
  | { type: "observed_reset" }
  | { type: "observed_synced" }
  | { type: "closed" };

export const initialHostState: HostState = {
  binding: undefined,
  persistent: false,
  observedSynced: false,
  closing: false,
};

type Transitions = {
  [Type in HostEvent["type"]]: (
    state: HostState,
    event: Extract<HostEvent, { type: Type }>,
  ) => HostState;
};

const transitions: Transitions = {
  bound: (state, event) => ({ ...state, binding: event.binding, persistent: event.persistent }),
  // Persistence and the observed stream belong to the binding they were established for.
  unbound: (state) => ({
    ...state,
    binding: undefined,
    persistent: false,
    observedSynced: false,
  }),
  observed_reset: (state) => ({
    ...state,
    observedSynced: false,
  }),
  observed_synced: (state) => (state.binding ? { ...state, observedSynced: true } : state),
  closed: (state) => ({ ...state, closing: true }),
};

export function hostState(state: HostState, event: HostEvent): HostState {
  const transition = transitions[event.type] as (state: HostState, event: HostEvent) => HostState;
  if (state.closing) return state;
  return transition(state, event);
}
