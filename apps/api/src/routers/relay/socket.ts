import { setWebSocketHooks, type Hooks } from "crossws";
import { Hono } from "hono";
import { MAX_RELAY_BYTES } from "@raypx/contracts/tasks";
import type { RelayHub } from "@raypx/control/relay";
import { relayHeaders } from "../../middleware/relay-headers.js";
export interface RelaySocketRuntime {
  hub: RelayHub | undefined;
  allowedOrigins: string[];
}

function admitRelay(request: Request, runtime: RelaySocketRuntime) {
  if (!runtime.hub || request.method !== "GET") return 404;
  const origin = request.headers.get("origin");
  if (origin && !runtime.allowedOrigins.includes(origin)) return 403;
  if (!runtime.hub.ready()) return 503;
  return 426;
}

/** Check before queuing frames; the hub also validates the complete protocol envelope. */
function relaySocketHooks(hub: RelayHub): Partial<Hooks> {
  return {
    open(peer) {
      hub.open({
        id: peer.id,
        send(frame) {
          if (peer.bufferedAmount > MAX_RELAY_BYTES) throw new Error("Backpressure");
          if (peer.send(JSON.stringify(frame)) === 0) throw new Error("Connection closed");
          if (peer.bufferedAmount > MAX_RELAY_BYTES) {
            peer.close(1013, "Backpressure");
            throw new Error("Backpressure");
          }
        },
        close: (code, reason) => peer.close(code, reason),
      });
    },
    message(peer, message) {
      const value = message.rawData;
      if (
        typeof value !== "string" ||
        new TextEncoder().encode(value).byteLength > MAX_RELAY_BYTES
      ) {
        peer.close(4000, "Invalid frame");
        return;
      }
      void hub.receive(peer.id, value).catch(() => peer.close(1013, "Relay unavailable"));
    },
    close(peer) {
      void hub.close(peer.id).catch(() => {});
    },
  };
}

export function createRelaySocketRoutes(runtime: RelaySocketRuntime) {
  const routes = new Hono();
  const hooks = runtime.hub ? relaySocketHooks(runtime.hub) : undefined;
  return routes.all("/", relayHeaders, (c) => {
    const request = c.req.raw;
    const status = admitRelay(request, runtime);
    const response = c.json({ error: status === 426 ? "UPGRADE_REQUIRED" : "UNAVAILABLE" }, status);
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      // Nitro's listener reads CrossWS hooks from the incoming request.
      setWebSocketHooks(request, status === 426 && hooks ? hooks : { upgrade: () => response });
    }
    return response;
  });
}
