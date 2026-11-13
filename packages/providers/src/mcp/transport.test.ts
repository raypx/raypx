import { expect, it, vi } from "vitest";
import { createMcpTransport, type McpTransportOptions } from "./transport.js";
const connection = {
  url: "https://tools.example.test/mcp",
  headers: { authorization: "Bearer private-value" },
};
function fixture(sse = false) {
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  const request: NonNullable<McpTransportOptions["request"]> = vi.fn(
    async (_endpoint, _headers, body) => {
      const message = JSON.parse(body) as {
        id?: number;
        method: string;
        params?: Record<string, unknown>;
      };
      calls.push(message);
      if (message.id === undefined) return { status: 202, headers: new Headers(), body: "" };
      let result: unknown = {};
      if (message.method === "initialize")
        result = {
          protocolVersion: message.params?.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fake", version: "1" },
        };
      if (message.method === "tools/list")
        result = {
          tools: [
            {
              name: "read_report",
              description: "Read report",
              inputSchema: { type: "object" },
              annotations: { readOnlyHint: true },
            },
          ],
        };
      if (message.method === "tools/call")
        result = { content: [{ type: "text", text: "untrusted remote output" }] };
      const json = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
      return {
        status: 200,
        headers: new Headers({ "content-type": sse ? "text/event-stream" : "application/json" }),
        body: sse ? `event: message\ndata: ${json}\n\n` : json,
      };
    },
  );
  const resolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { calls, request, resolver, transport: createMcpTransport({ request, resolver }) };
}
it.each([false, true])(
  "uses the official SDK with bounded JSON/SSE responses (SSE=%s)",
  async (sse) => {
    const f = fixture(sse);
    const tools = await f.transport.listTools(connection, new AbortController().signal);
    expect(tools).toEqual([
      {
        name: "read_report",
        description: "Read report",
        inputSchema: { type: "object" },
        readOnly: true,
      },
    ]);
    const result = await f.transport.callTool(
      connection,
      "read_report",
      {},
      new AbortController().signal,
    );
    expect(result.content).toContain("untrusted remote output");
    expect(f.resolver.mock.calls.length).toBeGreaterThan(3);
    expect(f.calls.filter((call) => call.method === "tools/call")).toHaveLength(1);
  },
);
it("does no network or DNS work on construction", () => {
  const resolver = vi.fn();
  const request = vi.fn();
  createMcpTransport({ resolver, request });
  expect(resolver).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
it("refuses a redirect to metadata before sending credentials there", async () => {
  const request = vi.fn<NonNullable<McpTransportOptions["request"]>>(async () => ({
    status: 307,
    headers: new Headers({ location: "http://169.254.169.254/latest" }),
    body: "",
  }));
  const transport = createMcpTransport({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    request,
  });
  await expect(transport.listTools(connection, new AbortController().signal)).rejects.toMatchObject(
    { code: "INVALID_ENDPOINT" },
  );
  expect(request).toHaveBeenCalledTimes(1);
});
it("blocks DNS rebinding on the next protocol request", async () => {
  const f = fixture();
  f.resolver
    .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    .mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
  await expect(
    f.transport.listTools(connection, new AbortController().signal),
  ).rejects.toMatchObject({ code: "INVALID_ENDPOINT" });
  expect(f.request).toHaveBeenCalledTimes(1);
});
it("times out even an injected transport that ignores cancellation", async () => {
  const transport = createMcpTransport({
    timeoutMs: 10,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    request: () => new Promise(() => {}),
  });
  await expect(transport.listTools(connection, new AbortController().signal)).rejects.toMatchObject(
    { code: "TIMED_OUT" },
  );
});
it("cancels an in-flight remote call without resending it", async () => {
  const f = fixture();
  const stop = new AbortController();
  const transport = createMcpTransport({
    resolver: f.resolver,
    request: async (endpoint, headers, body, signal) => {
      if (JSON.parse(body).method === "tools/call")
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
          stop.abort(new Error("STOPPED"));
        });
      return f.request(endpoint, headers, body, signal);
    },
  });
  await expect(transport.callTool(connection, "read_report", {}, stop.signal)).rejects.toThrow(
    "STOPPED",
  );
});
