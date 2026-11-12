import { expect, it } from "vitest";
import {
  acceptsCommands,
  initialRelaySession,
  relaySession,
  type RelaySession,
  type RelaySessionEvent,
} from "./session.js";

const run = (events: RelaySessionEvent[], state: RelaySession = initialRelaySession) =>
  events.reduce(relaySession, state);

it("reaches availability only through a resumed stream", () => {
  expect(run([{ type: "caught_up" }]).phase).toBe("offline");
  expect(run([{ type: "resumed" }]).phase).toBe("ready");
  expect(run([{ type: "resumed" }, { type: "caught_up" }]).phase).toBe("available");
});

it("keeps availability when the relay resumes a live stream again", () => {
  const available = run([{ type: "resumed" }, { type: "caught_up" }]);
  expect(relaySession(available, { type: "resumed" })).toBe(available);
});

it("withdraws availability on socket loss or replacement", () => {
  const available = run([{ type: "resumed" }, { type: "caught_up" }]);
  expect(relaySession(available, { type: "dropped" }).phase).toBe("offline");
  expect(relaySession(available, { type: "retired" }).phase).toBe("offline");
});

it("refuses commands while draining or detaching, independently of the connection", () => {
  expect(acceptsCommands(initialRelaySession)).toBe(true);
  const draining = run([{ type: "draining", active: true }]);
  const both = relaySession(draining, { type: "detaching", active: true });
  expect(acceptsCommands(draining)).toBe(false);
  expect(acceptsCommands(relaySession(both, { type: "draining", active: false }))).toBe(false);
  expect(
    acceptsCommands(
      run(
        [
          { type: "draining", active: false },
          { type: "detaching", active: false },
        ],
        both,
      ),
    ),
  ).toBe(true);
  // Replacing the connection does not end a drain or a detach in progress.
  expect(relaySession(both, { type: "retired" })).toMatchObject({
    draining: true,
    detaching: true,
  });
});

it("never mutates the state it was given", () => {
  const state = Object.freeze({ ...initialRelaySession });
  run(
    [
      { type: "resumed" },
      { type: "caught_up" },
      { type: "draining", active: true },
      { type: "retired" },
    ],
    state,
  );
  expect(state).toEqual(initialRelaySession);
});
