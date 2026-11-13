import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listen: vi.fn(), close: vi.fn(async () => {}) }));
vi.mock("@raypx/database/connection", () => ({ connectDatabaseNotifications: () => mocks }));
import { createSpaceFanout } from "./fanout.js";

it("admits bounded Space notices without content and closes its owned connection once", async () => {
  let receive = (_payload: string) => {};
  const unlisten = vi.fn(async () => {});
  mocks.listen.mockImplementation(async (_channel, callback: (payload: string) => void) => {
    receive = callback;
    return unlisten;
  });
  const fanout = createSpaceFanout("postgres://unused");
  const listener = vi.fn();
  const stop = await fanout.subscribe(listener);
  for (const value of [
    "invalid",
    "null",
    "{}",
    '{"spaceId":"s","sequence":-1,"kind":"space.renamed"}',
    '{"spaceId":"s","sequence":1,"kind":"unexpected"}',
  ])
    receive(value);
  expect(listener).not.toHaveBeenCalled();
  receive(
    '{"spaceId":"s","sequence":1,"kind":"space.member.removed","accountId":"a","email":"discarded"}',
  );
  expect(listener).toHaveBeenCalledExactlyOnceWith({
    spaceId: "s",
    sequence: 1,
    kind: "space.member.removed",
    accountId: "a",
  });
  receive('{"spaceId":"s","sequence":0,"kind":"space.deleted"}');
  expect(listener).toHaveBeenLastCalledWith({ spaceId: "s", sequence: 0, kind: "space.deleted" });
  expect(mocks.listen).toHaveBeenCalledWith("raypx_space_events", expect.any(Function));
  await stop();
  expect(unlisten).toHaveBeenCalledOnce();
  const closing = fanout.close();
  expect(fanout.close()).toBe(closing);
  await closing;
  expect(mocks.close).toHaveBeenCalledOnce();
});
