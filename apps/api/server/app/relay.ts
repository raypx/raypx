import { defineHandler, defineWebSocketHandler, HTTPError } from "nitro";
import { MAX_RELAY_BYTES } from "@raypx/contracts/tasks";
import type { RelayHub } from "@raypx/control/relay";
import { getBackendRuntime } from "../runtime/backend.ts";

interface SocketPeer {
  id: string;
  bufferedAmount: number;
  send(value: string): unknown;
  close(code: number, reason: string): void;
}
export interface RelaySocketRuntime {
  hub: RelayHub | undefined;
  allowedOrigins: string[];
}

export function admitRelay(request: Request, runtime: RelaySocketRuntime) {
  if (!runtime.hub || request.method !== "GET") return 404;
  const origin = request.headers.get("origin");
  if (origin && !runtime.allowedOrigins.includes(origin)) return 403;
  if (!runtime.hub.ready()) return 503;
  return 426;
}

/** Check before queuing frames; the hub also validates the complete v4 envelope. */
export function relaySocketHooks(hub: RelayHub) {
  return {
    open(peer: SocketPeer) {
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
    message(peer: SocketPeer, message: { rawData: unknown }) {
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
    close(peer: SocketPeer) {
      void hub.close(peer.id).catch(() => {});
    },
  };
}

export default defineWebSocketHandler(
  async (event) => {
    const runtime = await getBackendRuntime();
    const status = admitRelay(event.req, runtime);
    if (status !== 426 || !runtime.hub) throw new HTTPError({ status });
    return relaySocketHooks(runtime.hub);
  },
  defineHandler(async (event) => {
    const status = admitRelay(event.req, await getBackendRuntime());
    return Response.json(
      { error: status === 426 ? "UPGRADE_REQUIRED" : "UNAVAILABLE" },
      {
        status,
        headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
      },
    );
  }),
);
