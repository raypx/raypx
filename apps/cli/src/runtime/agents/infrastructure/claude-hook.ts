import { respondToClaudeHook, type ClaudeHookApprovalPort } from "@raypx/providers/claude";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export class ClaudeApprovalServer {
  private server: ReturnType<typeof Bun.serve> | undefined;
  private readonly tokens = new Map<string, string>();
  constructor(private readonly lookup: (id: string) => ClaudeHookApprovalPort | undefined) {}
  endpoint(id: string) {
    const server = this.start();
    const token = crypto.randomUUID() + crypto.randomUUID();
    this.tokens.set(id, token);
    return { url: "http://127.0.0.1:" + server.port + "/hook/" + id, token };
  }
  forget(id: string) {
    this.tokens.delete(id);
  }
  async close() {
    await this.server?.stop(true);
  }
  private start() {
    return (this.server ??= Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      idleTimeout: 0,
      fetch: async (request) => {
        const id = new URL(request.url).pathname.split("/")[2] ?? "";
        const execution = this.lookup(id);
        if (
          request.method !== "POST" ||
          !execution ||
          request.headers.get("authorization") !== `Bearer ${this.tokens.get(id)}`
        )
          return new Response(null, { status: 403 });
        try {
          if (Number(request.headers.get("content-length") ?? 0) > 256 * 1024)
            return new Response(null, { status: 413 });
          const raw = await request.text();
          if (Buffer.byteLength(raw) > 256 * 1024) return new Response(null, { status: 413 });
          const input = object(JSON.parse(raw));
          return await respondToClaudeHook(input, execution);
        } catch {
          return Response.json({ continue: false, stopReason: "Approval unavailable" });
        }
      },
    }));
  }
}
