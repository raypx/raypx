/** Stateless, non-executing MCP HTTP endpoint owned only by the browser fixture. */
export async function fixtureMcpResponse(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || !("method" in body))
    return new Response(null, { status: 400 });
  const rpc = body as {
    id?: string | number;
    method: string;
    params?: { protocolVersion?: string; name?: string; text?: string };
  };
  if (rpc.id === undefined) return new Response(null, { status: 202 });
  let result: unknown;
  switch (rpc.method) {
    case "initialize":
      result = {
        protocolVersion: rpc.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "browser-fixture", version: "1.0.0" },
      };
      break;
    case "tools/list":
      result = {
        tools: [
          {
            name: "fixture_echo",
            description: "Fixture echo",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
            annotations: { readOnlyHint: false },
          },
        ],
      };
      break;
    case "tools/call":
      if (rpc.params?.name !== "fixture_echo")
        return Response.json({
          jsonrpc: "2.0",
          id: rpc.id,
          error: { code: -32602, message: "Unknown tool" },
        });
      result = { content: [{ type: "text", text: "Fixture MCP result" }], isError: false };
      break;
    default:
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        error: { code: -32601, message: "Method not found" },
      });
  }
  return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
}
