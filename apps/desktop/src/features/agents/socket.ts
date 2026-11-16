import { createConversationFeed } from "@raypx/client/events";
import type { ConversationFeedSelection } from "@raypx/contracts/api";
import type { ConversationFeedPort, ConversationSocketPort } from "@raypx/agents/model";
import { createBrowserConversationSocket } from "@raypx/agents/client";
import { getBridge, isDesktop } from "../../lib/desktop.js";
import { apiUrl } from "../auth/client.js";

type SocketCallbacks = Parameters<ConversationSocketPort["connect"]>[0];

export function desktopConversationSocket(accountId: string): ConversationSocketPort {
  if (!isDesktop()) return createBrowserConversationSocket(apiUrl);
  return { connect: (callbacks) => desktopEventChannel(accountId, callbacks) };
}

export function desktopConversationFeed(accountId: string): ConversationFeedPort {
  if (!isDesktop()) return createConversationFeed(apiUrl);
  return {
    subscribe(selection, callbacks) {
      return desktopEventChannel(
        accountId,
        {
          ...callbacks,
          onFrame(frame) {
            if (frame.type !== "space.event" && frame.type !== "screen.event")
              callbacks.onFrame(frame);
          },
        },
        selection,
      );
    },
  };
}

/** The daemon opens the upstream stream with its private selected-origin session. */
function desktopEventChannel(
  accountId: string,
  callbacks: Omit<SocketCallbacks, "onClose"> & {
    onClose(code?: number, reason?: string, retryAfterMs?: number): void;
  },
  conversation?: ConversationFeedSelection,
): ReturnType<ConversationSocketPort["connect"]> {
  const id = crypto.randomUUID();
  const scope = new AbortController();
  const bridge = getBridge();
  let outgoing = Promise.resolve();
  function ended(code?: number, reason?: string, retryAfterMs?: number) {
    if (scope.signal.aborted) return;
    scope.abort();
    void bridge.then((value) => value.request.eventsClose({ id })).catch(() => {});
    if (code === undefined) callbacks.onClose();
    else if (retryAfterMs === undefined) callbacks.onClose(code, reason);
    else callbacks.onClose(code, reason, retryAfterMs);
  }
  const fail = (error: unknown) => {
    if (conversation && error instanceof Error && "code" in error && error.code === "AUTH_REQUIRED")
      ended(4001, "SESSION_ENDED");
    else ended();
  };
  void (async () => {
    const native = await bridge;
    if (scope.signal.aborted) return;
    await native.request.eventsOpen({ id, accountId, ...(conversation && { conversation }) });
    if (scope.signal.aborted) {
      await native.request.eventsClose({ id });
      return;
    }
    while (!scope.signal.aborted) {
      const frame = await native.request.eventsRead({ id });
      if (scope.signal.aborted) return;
      if (frame?.type === "closed") {
        ended(frame.code, frame.reason, frame.retryAfterMs);
        return;
      }
      if (frame) callbacks.onFrame(frame);
    }
  })().catch(fail);
  return {
    send(frame) {
      outgoing = outgoing
        .then(async () => {
          if (scope.signal.aborted) return;
          await (await bridge).request.eventsSend({ id, frame });
        })
        .catch(fail);
    },
    close() {
      if (scope.signal.aborted) return;
      scope.abort();
      void bridge.then((value) => value.request.eventsClose({ id })).catch(() => {});
    },
  };
}
