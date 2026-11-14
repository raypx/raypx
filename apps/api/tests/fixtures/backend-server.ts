import { serve } from "bun";
import { getWebSocketHooks } from "crossws";
import bunWebSocket from "crossws/adapters/bun";
const MAX_FRAME_BYTES = 1_500_000;

/** Loopback listener for integration tests using the same Hono routes as production. */
export function serveBackend(
  runtime: { app: { fetch(request: Request): Response | Promise<Response> } },
  port = 0,
) {
  const ws = bunWebSocket({
    async resolve(request) {
      const response = await runtime.app.fetch(request);
      return getWebSocketHooks(request) ?? { upgrade: () => response };
    },
  });
  return serve({
    hostname: "127.0.0.1",
    port,
    fetch(request, listener) {
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket")
        return ws.handleUpgrade(request, listener);
      return runtime.app.fetch(request);
    },
    websocket: {
      ...ws.websocket,
      maxPayloadLength: MAX_FRAME_BYTES,
      backpressureLimit: MAX_FRAME_BYTES,
      closeOnBackpressureLimit: true,
    },
  });
}
