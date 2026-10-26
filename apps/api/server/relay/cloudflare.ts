import { cloudJobRunSchema, JobError } from "@raypx/jobs";
import { RelayHub } from "./hub.js";
import { createCloudflareRuntime, type CloudflareBindings } from "../runtime/cloudflare.js";
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket & { accept(): void } } };
export class RelayRoom {
  private readonly hub: RelayHub;
  constructor(
    private readonly state: {
      id: { name?: string; toString?(): string };
      waitUntil(task: Promise<unknown>): void;
    },
    private readonly env: CloudflareBindings,
  ) {
    this.hub = new RelayHub(
      async (run) => {
        const runtime = await createCloudflareRuntime(env);
        try {
          return await run(runtime.control);
        } finally {
          await runtime.close();
        }
      },
      (userId) => this.inRoom(userId),
    );
  }
  private inRoom(userId: string) {
    try {
      const expected = this.env.RAYPX_RELAY?.idFromName?.(userId);
      if (expected) return expected.toString() === this.state.id.toString?.();
      return this.state.id.name !== undefined && this.state.id.name === userId;
    } catch {
      return false;
    }
  }
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === "/jobs/dispatch" || path === "/jobs/sync") {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      try {
        const text = await request.text();
        if (new TextEncoder().encode(text).byteLength > 256 * 1024)
          throw new JobError("INVALID_INPUT");
        const input: unknown = JSON.parse(text);
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).some((key) => key !== "userId" && key !== "run") ||
          !("userId" in input) ||
          typeof input.userId !== "string" ||
          !input.userId ||
          input.userId.length > 200 ||
          !("run" in input)
        )
          throw new JobError("INVALID_INPUT");
        const run = cloudJobRunSchema.parse(input.run);
        if (!this.inRoom(input.userId)) throw new JobError("FORBIDDEN");
        const result =
          path === "/jobs/dispatch"
            ? await this.hub.dispatch(input.userId, run, request.signal)
            : await this.hub.sync(input.userId, run, request.signal);
        return Response.json(result);
      } catch (error) {
        return Response.json(
          {
            error: {
              code: error instanceof JobError ? error.code : "INVALID_INPUT",
              uncertain: error instanceof JobError && error.uncertain,
            },
          },
          { status: error instanceof JobError && error.code === "FORBIDDEN" ? 403 : 503 },
        );
      }
    }
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
