import type { HostBinding } from "./vault.ts";

/** What the daemon knows about its single cloud binding. Values are immutable; `hostState` derives the next. */
export interface HostState {
  /** The one origin/account binding this daemon serves. */
  readonly binding: HostBinding | undefined;
  /** Whether the binding's credential survives a daemon restart. */
  readonly persistent: boolean;
  /** Advances whenever the selected account changes; work queued under an older selection is abandoned. */
  readonly selection: number;
  /** Advances whenever the relay restarts the observed stream; older exchanges are stale. */
  readonly observedEpoch: number;
  /** Whether the relay acknowledged the opening observed batch of the current stream. */
  readonly observedSynced: boolean;
  readonly closing: boolean;
}

export type HostEvent =
  | { type: "selected" }
  /** Callers confirm the daemon is open and the selection unchanged before binding. */
  | { type: "bound"; binding: HostBinding; persistent: boolean }
  | { type: "unbound" }
  | { type: "observed_reset" }
  | { type: "observed_synced" }
  | { type: "closed" };

export const initialHostState: HostState = {
  binding: undefined,
  persistent: false,
  selection: 0,
  observedEpoch: 0,
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
  selected: (state) => ({ ...state, selection: state.selection + 1 }),
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
    observedEpoch: state.observedEpoch + 1,
    observedSynced: false,
  }),
  observed_synced: (state) => ({ ...state, observedSynced: true }),
  closed: (state) => ({ ...state, closing: true }),
};

export function hostState(state: HostState, event: HostEvent): HostState {
  const transition = transitions[event.type] as (state: HostState, event: HostEvent) => HostState;
  return transition(state, event);
}
