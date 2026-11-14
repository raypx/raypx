import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConversationClientFrame } from "@raypx/contracts/api";
import { spaceIdSchema } from "@raypx/core/spaces";
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

it.each([
  [4003, "SPACE_MEMBER_REMOVED"],
  [4003, "SPACE_MEMBER_LEFT"],
  [4003, "SPACE_DELETING"],
  [4001, "SESSION_ENDED"],
  [1006, ""],
  [4999, ""],
])("forwards terminal close metadata %i/%s once and stops reading", async (code, reason) => {
  mocks.read.mockResolvedValueOnce({ type: "closed", code, reason });
  const onFrame = vi.fn(),
    onClose = vi.fn();
  const socket = desktopConversationSocket("owner").connect({ onFrame, onClose, onError: vi.fn() });
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith(code, reason));
  expect(onFrame).not.toHaveBeenCalled();
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
  socket.send({
    type: "space.ack",
    version: 1,
    spaceId: spaceIdSchema.parse("space"),
    sequence: 1,
  });
  socket.close();
  await Promise.resolve();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it("continues polling after an idle read and suppresses a terminal read after local close", async () => {
  let finish!: (value: unknown) => void;
  mocks.read.mockResolvedValueOnce(null).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onFrame = vi.fn(),
    onClose = vi.fn();
  const socket = desktopConversationSocket("owner").connect({ onFrame, onClose, onError: vi.fn() });
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  socket.close();
  finish({ type: "closed", code: 4003, reason: "SPACE_MEMBER_LEFT" });
  await Promise.resolve();
  expect(onClose).not.toHaveBeenCalled();
  expect(onFrame).not.toHaveBeenCalled();
});

it("preserves the remote ending when an in-flight send subsequently fails", async () => {
  let failSend!: (error: Error) => void;
  let finishRead!: (value: unknown) => void;
  mocks.send.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        failSend = reject;
      }),
  );
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  const onClose = vi.fn();
  const socket = desktopConversationSocket("owner").connect({
    onFrame: vi.fn(),
    onClose,
    onError: vi.fn(),
  });
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  socket.send({
    type: "space.ack",
    version: 1,
    spaceId: spaceIdSchema.parse("space"),
    sequence: 1,
  });
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  finishRead({ type: "closed", code: 4003, reason: "SPACE_DELETING" });
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith(4003, "SPACE_DELETING"));
  failSend(new Error("private diagnostic"));
  await Promise.resolve();
  await Promise.resolve();
  expect(onClose).toHaveBeenCalledOnce();
});
