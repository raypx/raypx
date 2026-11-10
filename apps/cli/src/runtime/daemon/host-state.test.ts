import { expect, it } from "vite-plus/test";
import { hostState, initialHostState, type HostEvent, type HostState } from "./host-state.ts";
import type { HostBinding } from "./vault.ts";

const binding: HostBinding = {
  accountId: "account",
  apiUrl: "https://api.example.test",
  deviceId: "device",
  epoch: 1,
  expiresAt: "2030-01-01T00:00:00.000Z",
};
const run = (events: HostEvent[], state: HostState = initialHostState) =>
  events.reduce(hostState, state);

it("keeps the exact binding object it was given", () => {
  const bound = run([{ type: "bound", binding, persistent: true }]);
  expect(bound.binding).toBe(binding);
  expect(bound.persistent).toBe(true);
});

it("drops persistence and observed progress together with the binding", () => {
  const unbound = run([
    { type: "bound", binding, persistent: true },
    { type: "observed_synced" },
    { type: "unbound" },
  ]);
  expect(unbound).toMatchObject({ binding: undefined, persistent: false, observedSynced: false });
  // Unbinding does not restart the observed stream numbering.
  expect(unbound.observedEpoch).toBe(initialHostState.observedEpoch);
});

it("restarts observed progress under a new epoch when the relay stream resets", () => {
  const reset = run([
    { type: "bound", binding, persistent: false },
    { type: "observed_synced" },
    { type: "observed_reset" },
  ]);
  expect(reset).toMatchObject({ observedEpoch: 1, observedSynced: false });
  expect(reset.binding).toBe(binding);
});

it("advances the selection without touching the binding", () => {
  const selected = run([{ type: "bound", binding, persistent: true }, { type: "selected" }]);
  expect(selected).toMatchObject({ selection: 1, persistent: true });
  expect(selected.binding).toBe(binding);
});

it("stays closing once closed and keeps the binding for the next start", () => {
  const closed = run([
    { type: "bound", binding, persistent: true },
    { type: "closed" },
    { type: "selected" },
  ]);
  expect(closed.closing).toBe(true);
  expect(closed.binding).toBe(binding);
});

it("never mutates the state it was given", () => {
  const state = Object.freeze({ ...initialHostState });
  run(
    [
      { type: "bound", binding, persistent: true },
      { type: "observed_reset" },
      { type: "unbound" },
      { type: "closed" },
    ],
    state,
  );
  expect(state).toEqual(initialHostState);
});
