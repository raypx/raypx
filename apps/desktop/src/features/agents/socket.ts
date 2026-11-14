import type { ConversationSocketPort } from "@raypx/agents/model";
import { createBrowserConversationSocket } from "@raypx/agents/client";
import { getBridge, isDesktop } from "../../lib/desktop.js";
import { apiUrl } from "../auth/client.js";

/** Remote cookies and the remote socket belong to the daemon, never to the WebView. */
export function desktopConversationSocket(accountId: string): ConversationSocketPort {
  if (!isDesktop()) return createBrowserConversationSocket(apiUrl);
  return {
    connect(callbacks) {
      const id = crypto.randomUUID();
      const scope = new AbortController();
      const bridge = getBridge();
      let outgoing = Promise.resolve();
      function ended(code?: number, reason?: string) {
        if (scope.signal.aborted) return;
        scope.abort();
        void bridge.then((value) => value.request.eventsClose({ id })).catch(() => {});
        if (code === undefined) callbacks.onClose();
        else callbacks.onClose(code, reason);
      }
      const fail = () => ended();
      void (async () => {
        const native = await bridge;
        if (scope.signal.aborted) return;
        await native.request.eventsOpen({ id, accountId });
        if (scope.signal.aborted) {
          await native.request.eventsClose({ id });
          return;
        }
        while (!scope.signal.aborted) {
          const frame = await native.request.eventsRead({ id });
          if (scope.signal.aborted) return;
          if (frame?.type === "closed") {
            ended(frame.code, frame.reason);
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
    },
  };
}
