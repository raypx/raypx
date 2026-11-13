import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listen: vi.fn(), close: vi.fn(async () => {}) }));
vi.mock("@raypx/database/connection", () => ({ connectDatabaseNotifications: () => mocks }));
import { createConversationFanout } from "./fanout.js";

it("accepts only usable hints, strips arbitrary payload fields and closes its owned connection once", async () => {
  let receive = (_payload: string) => {};
  const unlisten = vi.fn(async () => {});
  mocks.listen.mockImplementation(async (_channel, callback: (payload: string) => void) => {
    receive = callback;
    return unlisten;
  });
  const fanout = createConversationFanout("postgres://unused");
  const listener = vi.fn();
  const stop = await fanout.subscribe(listener);
  for (const value of ["invalid", "null", "{}", '{"conversationId":"c","sequence":0}'])
    receive(value);
  expect(listener).not.toHaveBeenCalled();
  receive('{"conversationId":"c","sequence":1,"text":"discarded"}');
  expect(listener).toHaveBeenCalledExactlyOnceWith({ conversationId: "c", sequence: 1 });
  expect(mocks.listen).toHaveBeenCalledWith("raypx_conversation_events", expect.any(Function));
  await stop();
  expect(unlisten).toHaveBeenCalledOnce();
  const closing = fanout.close();
  expect(fanout.close()).toBe(closing);
  await closing;
  expect(mocks.close).toHaveBeenCalledOnce();
});
