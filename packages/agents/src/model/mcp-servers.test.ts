import { expect, it, vi } from "vitest";
import { mcpServerSchema, mcpTestCodeSchema } from "@raypx/core/mcp-servers";
import {
  McpHeaderSecret,
  McpServersController,
  createMcpServerDraft,
  discoveredMcpTools,
  type McpServersPort,
} from "./mcp-servers.js";
const server = mcpServerSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Research",
  url: "https://example.com/mcp",
  transport: "http",
  availability: { mode: "all" },
  hasCredentials: true,
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T00:00:00Z",
});
function fixture() {
  const port: McpServersPort = {
    list: vi.fn(async () => [server]),
    create: vi.fn(async () => server),
    update: vi.fn(async () => server),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({ code: "SUCCEEDED" as const, toolNames: ["read_page"] })),
    setAvailability: vi.fn(async () => server),
  };
  return { port, controller: new McpServersController(port, { list: async () => [] }) };
}
it("consumes write-only headers on success, invalid input and clear", () => {
  const secret = new McpHeaderSecret();
  secret.set("Authorization: Bearer private\nX-Key: secret");
  expect(secret.take()).toEqual({ Authorization: "Bearer private", "X-Key": "secret" });
  expect(secret.take()).toBeUndefined();
  secret.set("invalid");
  expect(() => secret.take()).toThrow("INVALID_HEADERS");
  expect(secret.take()).toBeUndefined();
  secret.set("X-Key: secret");
  secret.clear();
  expect(secret.take()).toBeUndefined();
  expect(createMcpServerDraft(server)).not.toHaveProperty("credentialHeaders");
});
it("never exposes submitted headers in observable state and omits unchanged headers", async () => {
  const { port, controller } = fixture();
  await controller.load();
  await controller.save(server.id, { ...createMcpServerDraft(server), transport: "http" });
  expect(port.update).toHaveBeenCalledWith({
    id: server.id,
    server: { ...createMcpServerDraft(server), transport: "http" },
  });
  await controller.save(
    null,
    { ...createMcpServerDraft(server), transport: "http" },
    { Authorization: "private" },
  );
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("private");
});
it.each(mcpTestCodeSchema.options)(
  "retains plain outcome %s and discovered names",
  async (code) => {
    const { port, controller } = fixture();
    vi.mocked(port.test).mockResolvedValue({
      code,
      toolNames: code === "SUCCEEDED" ? ["read_page"] : [],
    });
    await controller.load();
    await controller.test(server.id);
    expect(controller.getSnapshot().results[server.id]?.code).toBe(code);
  },
);
it("builds exact namespace names only from successful discovered tools", () => {
  const tools = discoveredMcpTools(server, {
    code: "SUCCEEDED",
    toolNames: ["read_page", "invalid name"],
  });
  expect(tools).toEqual([
    {
      name: "mcp_00000000000040008000000000000001__read_page",
      serverName: "Research",
      remoteName: "read_page",
    },
  ]);
  expect(discoveredMcpTools(server, { code: "REQUEST_FAILED", toolNames: ["read_page"] })).toEqual(
    [],
  );
});
