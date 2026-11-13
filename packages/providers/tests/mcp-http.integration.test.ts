import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createMcpTransport } from "../src/mcp/index.js";

/** Separate opt-in listener gate: unit suites remain deterministic without sockets. */
describe.runIf(process.env.RAYPX_TEST_MCP_HTTP === "1")("streamable HTTP loopback", () => {
  it("lists and calls an in-process fake remote server", async () => {
    const received: string[] = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const message = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        id?: number;
        method: string;
        params?: { protocolVersion?: string };
      };
      received.push(message.method);
      if (message.id === undefined) {
        res.writeHead(202);
        res.end();
        return;
      }
      let result: unknown = {};
      if (message.method === "initialize")
        result = {
          protocolVersion: message.params?.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "loopback-fixture", version: "1" },
        };
      if (message.method === "tools/list")
        result = {
          tools: [
            {
              name: "lookup",
              inputSchema: { type: "object" },
              annotations: { readOnlyHint: true },
            },
          ],
        };
      if (message.method === "tools/call")
        result = { content: [{ type: "text", text: "loopback response" }] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing listener");
      const connection = { url: `http://127.0.0.1:${address.port}/mcp`, headers: {} };
      const transport = createMcpTransport();
      expect((await transport.listTools(connection, new AbortController().signal))[0]?.name).toBe(
        "lookup",
      );
      expect(
        (await transport.callTool(connection, "lookup", {}, new AbortController().signal)).content,
      ).toContain("loopback response");
      expect(received.filter((method) => method === "tools/call")).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
