import { afterEach, expect, it, vi } from "vitest";
import { originRecovery } from "@raypx/client/api";
import { browserConversationSocket } from "./browser-ports.js";

afterEach(() => vi.unstubAllGlobals());
it("does not turn a deliberate navigation close into an origin outage", async () => {
  class Socket extends EventTarget {
    send() {}
    close() {
      queueMicrotask(() => this.dispatchEvent(new Event("error")));
    }
  }
  vi.stubGlobal("WebSocket", Socket);
  const origin = `https://${crypto.randomUUID()}.example.test`;
  const recovery = originRecovery(origin, vi.fn());
  const onError = vi.fn();
  const socket = browserConversationSocket(origin).connect({
    onFrame: vi.fn(),
    onClose: vi.fn(),
    onError,
  });
  socket.close();
  await Promise.resolve();
  expect(onError).not.toHaveBeenCalled();
  expect(recovery.getSnapshot()).toBe("ready");
  recovery.dispose();
});
