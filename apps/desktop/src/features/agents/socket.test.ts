import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConversationClientFrame } from "@raypx/contracts/api";
const mocks = vi.hoisted(() => ({
  native: true,
  open: vi.fn(),
  read: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  browser: vi.fn(),
}));
vi.mock("../../lib/desktop.js", () => ({
  isDesktop: () => mocks.native,
  getBridge: async () => ({
    request: {
      eventsOpen: mocks.open,
      eventsRead: mocks.read,
      eventsSend: mocks.send,
      eventsClose: mocks.close,
    },
  }),
}));
vi.mock("../auth/client.js", () => ({ apiUrl: "https://api.example.test" }));
vi.mock("@raypx/agents/client", () => ({ createBrowserConversationSocket: mocks.browser }));
import { desktopConversationSocket } from "./socket.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.native = true;
  mocks.open.mockResolvedValue(true);
  mocks.close.mockResolvedValue(true);
  mocks.send.mockResolvedValue(true);
  mocks.read.mockImplementation(() => new Promise(() => {}));
});
afterEach(() => vi.restoreAllMocks());

it("carries public frames through native requests, retaining explicit ACK order", async () => {
  mocks.read.mockResolvedValueOnce({ type: "ready", version: 1 });
  const onFrame = vi.fn(),
    onClose = vi.fn();
  const socket = desktopConversationSocket("owner").connect({ onFrame, onClose, onError: vi.fn() });
  await vi.waitFor(() => expect(onFrame).toHaveBeenCalledWith({ type: "ready", version: 1 }));
  const id = mocks.open.mock.calls[0]![0].id as string;
  const frame = {
    type: "ack",
    version: 1,
    spaceId: "space",
    conversationId: "conversation",
    sequence: 9,
  } as unknown as ConversationClientFrame;
  socket.send(frame);
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith({ id, frame }));
  socket.close();
  await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledWith({ id }));
  expect(onClose).not.toHaveBeenCalled();
  expect(mocks.open).toHaveBeenCalledWith({ id, accountId: "owner" });
});

it("reports connection failure once and does not deliver late frames after close", async () => {
  let resolve!: (frame: unknown) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onFrame = vi.fn(),
    onClose = vi.fn();
  const socket = desktopConversationSocket("owner").connect({ onFrame, onClose, onError: vi.fn() });
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  socket.close();
  resolve({ type: "ready", version: 1 });
  await Promise.resolve();
  expect(onFrame).not.toHaveBeenCalled();
  mocks.open.mockRejectedValueOnce(new Error("private diagnostic"));
  desktopConversationSocket("owner").connect({ onFrame, onClose, onError: vi.fn() });
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(onClose.mock.calls[0]).toEqual([]);
});

it("closes a connection that finishes opening after its view has gone away", async () => {
  let opened!: () => void;
  mocks.open.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        opened = done;
      }),
  );
  const socket = desktopConversationSocket("owner").connect({
    onFrame: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
  });
  await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  socket.close();
  opened();
  await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(2));
  expect(mocks.read).not.toHaveBeenCalled();
});

it("uses the browser's authenticated socket only in a browser preview", () => {
  mocks.native = false;
  const port = { connect: vi.fn() };
  mocks.browser.mockReturnValue(port);
  expect(desktopConversationSocket("owner")).toBe(port);
  expect(mocks.browser).toHaveBeenCalledWith("https://api.example.test");
});
