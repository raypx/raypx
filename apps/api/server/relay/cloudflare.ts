import { RelayHub } from "./hub.js";
import { createCloudflareRuntime, type CloudflareBindings } from "../runtime/cloudflare.js";
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket & { accept(): void } } };
export class RelayRoom {
  private readonly hub: RelayHub;
  constructor(
    private readonly state: { id: { name?: string }; waitUntil(task: Promise<unknown>): void },
    env: CloudflareBindings,
  ) {
    this.hub = new RelayHub(async (run) => {
      const runtime = await createCloudflareRuntime(env);
      try {
        return await run(runtime.control);
      } finally {
        await runtime.close();
      }
    }, state.id.name);
  }
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/revoke" && request.method === "POST") {
      const input = (await request.json()) as { userId: string; deviceId: string };
      await this.hub.revoke(input.userId, input.deviceId);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response(null, { status: 426 });
    const pair = new WebSocketPair(),
      socket = pair[1],
      id = crypto.randomUUID();
    socket.accept();
    this.hub.open({
      id,
      send: (frame) => socket.send(JSON.stringify(frame)),
      close: (code, reason) => socket.close(code, reason),
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") this.state.waitUntil(this.hub.receive(id, event.data));
      else socket.close(4000, "Invalid frame");
    });
    socket.addEventListener("close", () => {
      this.state.waitUntil(this.hub.close(id));
    });
    socket.addEventListener("error", () => {
      this.state.waitUntil(this.hub.close(id));
    });
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }
}
