import { expect, it, vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import type { McpServerConfiguration } from "@raypx/core/mcp-servers";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { McpTransport } from "@raypx/providers/mcp";
import { applicationSecretKeyProvider } from "./secrets.js";
import {
  createMcpServers,
  McpServerError,
  type McpServersRepository,
  type StoredMcpServer,
} from "./mcp-servers.js";
import type { SealedSecret } from "./secret-types.js";

const at = "2026-11-14T00:00:00.000Z";
const configuration: McpServerConfiguration = {
  name: "Reports",
  transport: "http",
  url: "https://tools.example.test/mcp",
  availability: { mode: "all" },
};
function scope(accountId = "owner", id = "a"): SpaceScope {
  const spaceId = spaceIdSchema.parse(id);
  return { spaceId, member: { accountId, spaceId, role: "member", createdAt: at } } as SpaceScope;
}
function fixture() {
  const rows = new Map<string, StoredMcpServer & { accountId: string }>();
  const sealed = new Map<string, SealedSecret>();
  const selections = new Map<string, string[]>();
  const members = new Map([
    ["owner", new Set(["a", "b"])],
    ["other", new Set(["a"])],
  ]);
  const transport: McpTransport = {
    validate: vi.fn(),
    listTools: vi.fn(async () => [
      { name: "read_report", description: "Read", inputSchema: { type: "object" }, readOnly: true },
    ]),
    callTool: vi.fn(async () => ({ content: "external text", isError: false, truncated: false })),
  };
  function owned(accountId: string, id: string) {
    const row = rows.get(id);
    if (!row || row.accountId !== accountId) throw new McpServerError("NOT_FOUND");
    const { accountId: _owner, ...stored } = row;
    return structuredClone(stored);
  }
  function available(accountId: string, spaceId?: string) {
    return [...rows.values()]
      .filter(
        (row) =>
          row.accountId === accountId &&
          (spaceId === undefined ||
            (members.get(accountId)?.has(spaceId) &&
              (row.availability.mode === "all" ||
                row.availability.spaceIds.some((id) => id === spaceId)))),
      )
      .map((row) => owned(accountId, row.id));
  }
  const repository: McpServersRepository = {
    async list(accountId, spaceId) {
      return available(accountId, spaceId);
    },
    async get(accountId, id) {
      return owned(accountId, id);
    },
    async create(accountId, id, secretId, input, secret, hasCredentials) {
      rows.set(id, {
        id,
        accountId,
        secretId,
        name: input.name,
        transport: "http",
        url: input.url,
        perCallSecretHeader: input.perCallSecretHeader ?? null,
        availability: input.availability,
        hasCredentials,
        createdAt: at,
        updatedAt: at,
      });
      sealed.set(secretId, secret);
      return owned(accountId, id);
    },
    async update(accountId, id, input, secret, hasCredentials) {
      const row = owned(accountId, id);
      rows.set(id, {
        ...row,
        ...input,
        transport: "http",
        accountId,
        hasCredentials: hasCredentials ?? row.hasCredentials,
      });
      if (secret) sealed.set(row.secretId, secret);
      return owned(accountId, id);
    },
    async delete(accountId, id) {
      const row = owned(accountId, id);
      rows.delete(id);
      sealed.delete(row.secretId);
      return { deleted: true };
    },
    async readSecret(accountId, id, secretId) {
      owned(accountId, id);
      const value = sealed.get(secretId);
      if (!value) throw new McpServerError("NOT_FOUND");
      return value;
    },
    async enabled(selected, agentId) {
      const ids =
        selections.get(`${selected.member.accountId}:${selected.spaceId}:${agentId}`) ?? [];
      return ids.filter((id) =>
        available(selected.member.accountId, selected.spaceId).some((row) => row.id === id),
      );
    },
    async setEnabled(selected, agentId, ids) {
      if (
        ids.some(
          (id) =>
            !available(selected.member.accountId, selected.spaceId).some((row) => row.id === id),
        )
      )
        throw new McpServerError("NOT_FOUND");
      selections.set(`${selected.member.accountId}:${selected.spaceId}:${agentId}`, ids);
      return ids;
    },
  };
  return {
    rows,
    sealed,
    members,
    repository,
    transport,
    service: createMcpServers(
      repository,
      applicationSecretKeyProvider("mcp-test-wrapping-key-private-value"),
      transport,
    ),
  };
}
it("keeps credentials encrypted and write-only through creation, update, catalog and test", async () => {
  const f = fixture();
  const credential = 'Bearer escaped-"-\\-private-value';
  const created = await f.service.create("owner", configuration, { Authorization: credential });
  expect(created.hasCredentials).toBe(true);
  expect(
    JSON.stringify([created, await f.service.list("owner"), [...f.sealed.values()]]),
  ).not.toContain(credential);
  await f.service.setEnabled(scope(), agentIdSchema.parse("agent"), [created.id]);
  const catalog = await f.service.catalog(
    scope(),
    agentIdSchema.parse("agent"),
    "run",
    new AbortController().signal,
  );
  expect(catalog[0]?.tools[0]?.name).toBe("read_report");
  expect(f.service.protectedValues()).toContain(credential);
  expect(await f.service.test("owner", created.id)).toEqual({
    code: "SUCCEEDED",
    toolNames: ["read_report"],
  });
  vi.mocked(f.transport.listTools).mockResolvedValue([
    {
      name: "read_report",
      description: credential,
      inputSchema: { type: "object" },
      readOnly: true,
    },
  ]);
  expect(await f.service.test("owner", created.id)).toEqual({
    code: "REQUEST_FAILED",
    toolNames: [],
  });
  await expect(
    f.service.catalog(scope(), agentIdSchema.parse("agent"), "run", new AbortController().signal),
  ).rejects.toMatchObject({ code: "MCP_OPERATION_FAILED" });
  f.service.release("run");
  expect(f.service.protectedValues()).toEqual([]);
});
it("availability includes future Spaces for all, narrows deliberately and never crosses members", async () => {
  const f = fixture();
  const created = await f.service.create("owner", configuration);
  f.members.get("owner")!.add("future");
  expect(await f.repository.list("owner", "future")).toHaveLength(1);
  expect(await f.service.list("other")).toEqual([]);
  await expect(f.service.update("other", created.id, configuration)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    f.service.setEnabled(scope("other"), agentIdSchema.parse("agent"), [created.id]),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await f.service.setAvailability("owner", created.id, {
    mode: "selected",
    spaceIds: [spaceIdSchema.parse("a")],
  });
  expect(await f.repository.list("owner", "b")).toEqual([]);
  expect(await f.repository.list("owner", "future")).toEqual([]);
});
it("rejects stdio and unsafe credential headers without touching a transport", async () => {
  const f = fixture();
  await expect(
    f.service.create("owner", { ...configuration, transport: "stdio", url: "command" }),
  ).rejects.toMatchObject({ code: "MCP_STDIO_UNSUPPORTED" });
  await expect(
    f.service.create("owner", configuration, { Cookie: "session=secret" }),
  ).rejects.toMatchObject({ code: "MCP_CREDENTIALS_REJECTED" });
  await expect(
    f.service.create("owner", configuration, { Authorization: "value\r\nCookie: bad" }),
  ).rejects.toMatchObject({ code: "MCP_CREDENTIALS_REJECTED" });
  expect(f.transport.listTools).not.toHaveBeenCalled();
  expect(f.transport.callTool).not.toHaveBeenCalled();
});
it("rechecks availability and endpoint fingerprints before a pinned call", async () => {
  const f = fixture();
  const created = await f.service.create("owner", configuration);
  const agent = agentIdSchema.parse("agent");
  await f.service.setEnabled(scope(), agent, [created.id]);
  const [pin] = await f.service.catalog(scope(), agent, "run", new AbortController().signal);
  await f.service.update("owner", created.id, {
    ...configuration,
    url: "https://changed.example.test/mcp",
  });
  await expect(
    f.service.call(scope(), agent, "run", pin!, "read_report", {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.transport.callTool).not.toHaveBeenCalled();
});

it("never persists or retains a one-call declared header and revalidates its fingerprint", async () => {
  const f = fixture();
  const selected = scope();
  const agent = agentIdSchema.parse("agent");
  const signal = new AbortController().signal;
  const server = await f.service.create("owner", {
    ...configuration,
    perCallSecretHeader: "x-call-key",
  });
  await f.service.setEnabled(selected, agent, [server.id]);
  const [pin] = await f.service.catalog(selected, agent, "run", signal);
  const value = crypto.randomUUID();
  vi.mocked(f.transport.callTool).mockResolvedValue({
    content: Buffer.from(value).toString("base64"),
    isError: false,
    truncated: false,
  });
  const result = await f.service.call(selected, agent, "run", pin!, "read_report", {}, signal, {
    name: "x-call-key",
    value,
  });
  expect(result.content).toBe("[protected]");
  expect(
    JSON.stringify([f.rows, [...f.sealed.values()], f.service.protectedValues()]).includes(value),
  ).toBe(false);
  await f.service.call(selected, agent, "run", pin!, "read_report", {}, signal);
  expect(vi.mocked(f.transport.callTool).mock.calls.at(-1)?.[0].headers).not.toHaveProperty(
    "x-call-key",
  );
  await f.service.update("owner", server.id, {
    ...configuration,
    perCallSecretHeader: "x-other-key",
  });
  await expect(
    f.service.call(selected, agent, "run", pin!, "read_report", {}, signal, {
      name: "x-call-key",
      value,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("refuses a destination changed between pin validation and single-call dispatch", async () => {
  const f = fixture();
  const selected = scope();
  const agent = agentIdSchema.parse("agent");
  const signal = new AbortController().signal;
  const server = await f.service.create("owner", {
    ...configuration,
    perCallSecretHeader: "x-call-key",
  });
  await f.service.setEnabled(selected, agent, [server.id]);
  const [pin] = await f.service.catalog(selected, agent, "run", signal);
  const list = f.repository.list;
  let reads = 0;
  vi.spyOn(f.repository, "list").mockImplementation(async (...args) => {
    reads++;
    if (reads === 2) f.rows.get(server.id)!.url = "https://changed.example.test/mcp";
    return list(...args);
  });
  await expect(
    f.service.call(selected, agent, "run", pin!, "read_report", {}, signal, {
      name: "x-call-key",
      value: "single-call-test-value",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.transport.callTool).not.toHaveBeenCalled();
});
