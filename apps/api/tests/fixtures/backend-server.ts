import { serve } from "bun";
import { MAX_RELAY_BYTES } from "@raypx/contracts/tasks";
import { admitRelay, relaySocketHooks, type RelaySocketRuntime } from "../../server/app/relay.ts";

/** Loopback transport for source integration tests; production uses Nitro's adapter. */
export function serveBackend(
  runtime: RelaySocketRuntime & { app: { fetch(request: Request): Response | Promise<Response> } },
  port = 0,
) {
  const hooks = runtime.hub ? relaySocketHooks(runtime.hub) : undefined;
  const peer = (socket: Bun.ServerWebSocket<{ id: string }>) => ({
    id: socket.data.id,
    get bufferedAmount() {
      return socket.getBufferedAmount();
    },
    send: (value: string) => socket.send(value),
    close: (code: number, reason: string) => socket.close(code, reason),
  });
  return serve<{ id: string }>({
    hostname: "127.0.0.1",
    port,
    fetch(request, listener) {
      if (new URL(request.url).pathname !== "/relay") return runtime.app.fetch(request);
      const status = admitRelay(request, runtime);
      if (status === 426 && listener.upgrade(request, { data: { id: crypto.randomUUID() } }))
        return;
      return new Response(null, { status });
    },
    websocket: {
      maxPayloadLength: MAX_RELAY_BYTES,
      backpressureLimit: MAX_RELAY_BYTES,
      closeOnBackpressureLimit: true,
      open: (socket) => hooks?.open(peer(socket)),
      message: (socket, value) => hooks?.message(peer(socket), { rawData: value }),
      close: (socket) => hooks?.close(peer(socket)),
    },
  });
}
