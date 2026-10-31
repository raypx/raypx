import { defineWebSocketHandler } from "nitro";
import { serverRelay as hub } from "../runtime/server.js";
import { getApiEnvironment } from "../env.js";
export default defineWebSocketHandler({
  upgrade(request) {
    const origin = request.headers.get("origin");
    if (origin && !getApiEnvironment().allowedOrigins.includes(origin))
      throw new Response(null, { status: 403 });
  },
  open(peer) {
    return hub.open({
      id: peer.id,
      send: (frame) => {
        // crossws reads Bun's getBufferedAmount() behind its portable peer getter.
        if (peer.bufferedAmount > 1024 * 1024) throw new Error("Backpressure");
        peer.send(JSON.stringify(frame));
      },
      close: (code, reason) => peer.close(code, reason),
    });
  },
  message(peer, message) {
    return hub.receive(peer.id, message.text());
  },
  close(peer) {
    return hub.close(peer.id);
  },
  error(peer) {
    return hub.close(peer.id);
  },
});
