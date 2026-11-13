import type { AgentId } from "@raypx/core/agents";
import type {
  McpCredentialHeaders,
  McpServer,
  McpServerConfiguration,
  McpTestCode,
} from "@raypx/core/mcp-servers";
import { mcpCredentialHeadersSchema, mcpServerConfigurationSchema } from "@raypx/core/mcp-servers";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  McpTransportError,
  mcpProtectedValues,
  type McpRemoteTool,
  type McpTransport,
} from "@raypx/providers/mcp";
import type { SecretKeyProvider, SealedSecret } from "./secret-types.js";
import { openStoredSecret, sealStoredSecret } from "./secret-envelope.js";

export class McpServerError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "INVALID_MCP_SERVER"
      | "MCP_SERVER_LIMIT"
      | "MCP_STDIO_UNSUPPORTED"
      | "MCP_CREDENTIALS_REJECTED"
      | "MCP_OPERATION_FAILED",
  ) {
    super(code);
    this.name = "McpServerError";
  }
}
export interface StoredMcpServer extends McpServer {
  secretId: string;
}
export interface McpServersRepository {
  list(this: void, accountId: string, spaceId?: string): Promise<StoredMcpServer[]>;
  get(this: void, accountId: string, id: string): Promise<StoredMcpServer>;
  create(
    this: void,
    accountId: string,
    id: string,
    secretId: string,
    input: McpServerConfiguration,
    secret: SealedSecret,
    hasCredentials: boolean,
  ): Promise<StoredMcpServer>;
  update(
    this: void,
    accountId: string,
    id: string,
    input: McpServerConfiguration,
    secret?: SealedSecret,
    hasCredentials?: boolean,
  ): Promise<StoredMcpServer>;
  delete(this: void, accountId: string, id: string): Promise<{ deleted: true }>;
  readSecret(this: void, accountId: string, id: string, secretId: string): Promise<SealedSecret>;
  enabled(this: void, scope: SpaceScope, agentId: AgentId): Promise<string[]>;
  setEnabled(this: void, scope: SpaceScope, agentId: AgentId, ids: string[]): Promise<string[]>;
}
function publicServer(row: StoredMcpServer): McpServer {
  const { secretId: _secretId, ...server } = row;
  return server;
}
function validateHeaders(headers: McpCredentialHeaders): McpCredentialHeaders {
  const parsed = mcpCredentialHeadersSchema.safeParse(headers);
  if (!parsed.success) throw new McpServerError("MCP_CREDENTIALS_REJECTED");
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed.data)) {
    const key = name.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key) ||
      /[\r\n\0]/.test(value) ||
      [
        "host",
        "cookie",
        "set-cookie",
        "origin",
        "referer",
        "connection",
        "content-length",
        "content-type",
        "accept",
        "transfer-encoding",
        "proxy-authorization",
        "forwarded",
        "x-forwarded-for",
      ].includes(key) ||
      key.startsWith("mcp-") ||
      key.startsWith("sec-") ||
      Object.hasOwn(normalized, key)
    )
      throw new McpServerError("MCP_CREDENTIALS_REJECTED");
    normalized[key] = value;
  }
  return normalized;
}
export async function mcpServerFingerprint(server: McpServer): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([server.id, server.url])),
  );
  return Buffer.from(bytes).toString("hex");
}
/** Runtime construction performs no I/O. Credentials are only opened inside test/call. */
export function createMcpServers(
  repository: McpServersRepository,
  keys: SecretKeyProvider,
  transport: McpTransport,
) {
  const activeSecrets = new Map<string, string[]>();
  function validate(input: McpServerConfiguration) {
    if (input.transport === "stdio") throw new McpServerError("MCP_STDIO_UNSUPPORTED");
    const parsed = mcpServerConfigurationSchema.safeParse(input);
    if (!parsed.success) throw new McpServerError("INVALID_MCP_SERVER");
    try {
      transport.validate(parsed.data.url);
    } catch {
      throw new McpServerError("INVALID_MCP_SERVER");
    }
    return parsed.data;
  }
  async function credentials(accountId: string, row: StoredMcpServer) {
    const sealed = await repository.readSecret(accountId, row.id, row.secretId);
    const value = await openStoredSecret(keys, accountId, row.secretId, sealed);
    return validateHeaders(JSON.parse(value) as McpCredentialHeaders);
  }
  async function available(scope: SpaceScope, id: string) {
    const row = (await repository.list(scope.member.accountId, scope.spaceId)).find(
      (item) => item.id === id,
    );
    if (!row) throw new McpServerError("NOT_FOUND");
    return row;
  }
  async function withConnection<T>(
    scope: SpaceScope,
    id: string,
    runId: string | undefined,
    operation: (server: McpServer, headers: McpCredentialHeaders) => Promise<T>,
  ) {
    const row = await available(scope, id);
    const headers = await credentials(scope.member.accountId, row);
    if (runId)
      activeSecrets.set(runId, [
        ...new Set([...(activeSecrets.get(runId) ?? []), ...mcpProtectedValues(headers)]),
      ]);
    return operation(publicServer(row), headers);
  }
  function guard(value: unknown, values: string[]) {
    function contains(candidate: unknown): boolean {
      if (typeof candidate === "string")
        return values.some((secret) => secret && candidate.includes(secret));
      if (Array.isArray(candidate)) return candidate.some(contains);
      if (!candidate || typeof candidate !== "object") return false;
      return Object.entries(candidate).some(([key, child]) => contains(key) || contains(child));
    }
    if (contains(value)) throw new McpServerError("MCP_OPERATION_FAILED");
  }
  return {
    protectedValues: () => [...activeSecrets.values()].flat(),
    release(runId: string) {
      activeSecrets.delete(runId);
    },
    list: async (accountId: string) => (await repository.list(accountId)).map(publicServer),
    async create(
      accountId: string,
      input: McpServerConfiguration,
      rawHeaders: McpCredentialHeaders = {},
    ) {
      const parsed = validate(input);
      const headers = validateHeaders(rawHeaders);
      guard(parsed, mcpProtectedValues(headers));
      const id = crypto.randomUUID();
      const secretId = crypto.randomUUID();
      const sealed = await sealStoredSecret(keys, accountId, secretId, JSON.stringify(headers));
      return publicServer(
        await repository.create(
          accountId,
          id,
          secretId,
          parsed,
          sealed,
          Object.keys(headers).length > 0,
        ),
      );
    },
    async update(
      accountId: string,
      id: string,
      input: McpServerConfiguration,
      rawHeaders?: McpCredentialHeaders,
    ) {
      const parsed = validate(input);
      const current = await repository.get(accountId, id);
      if (rawHeaders === undefined) {
        guard(parsed, mcpProtectedValues(await credentials(accountId, current)));
        return publicServer(await repository.update(accountId, id, parsed));
      }
      const headers = validateHeaders(rawHeaders);
      guard(parsed, mcpProtectedValues(headers));
      const sealed = await sealStoredSecret(
        keys,
        accountId,
        current.secretId,
        JSON.stringify(headers),
      );
      return publicServer(
        await repository.update(accountId, id, parsed, sealed, Object.keys(headers).length > 0),
      );
    },
    delete: (accountId: string, id: string) => repository.delete(accountId, id),
    async setAvailability(
      accountId: string,
      id: string,
      availability: McpServerConfiguration["availability"],
    ) {
      const current = await repository.get(accountId, id);
      return publicServer(
        await repository.update(accountId, id, {
          name: current.name,
          url: current.url,
          transport: "http",
          availability,
        }),
      );
    },
    async test(accountId: string, id: string): Promise<{ code: McpTestCode; toolNames: string[] }> {
      const row = await repository.get(accountId, id);
      try {
        const headers = await credentials(accountId, row);
        const tools = await transport.listTools(
          { url: row.url, headers },
          new AbortController().signal,
        );
        guard(tools, mcpProtectedValues(headers));
        return { code: "SUCCEEDED", toolNames: tools.map((tool) => tool.name) };
      } catch (error) {
        return {
          code: error instanceof McpTransportError ? error.code : "REQUEST_FAILED",
          toolNames: [],
        };
      }
    },
    enabled: (scope: SpaceScope, agentId: AgentId) => repository.enabled(scope, agentId),
    setEnabled: (scope: SpaceScope, agentId: AgentId, ids: string[]) =>
      repository.setEnabled(scope, agentId, ids),
    async catalog(scope: SpaceScope, agentId: AgentId, runId: string, signal: AbortSignal) {
      const ids = await repository.enabled(scope, agentId);
      const result: { serverId: string; fingerprint: string; tools: McpRemoteTool[] }[] = [];
      for (const id of ids) {
        await withConnection(scope, id, runId, async (server, headers) => {
          const tools = await transport.listTools({ url: server.url, headers }, signal);
          guard(tools, mcpProtectedValues(headers));
          result.push({ serverId: id, fingerprint: await mcpServerFingerprint(server), tools });
          if (
            result.reduce((count, item) => count + item.tools.length, 0) > 128 ||
            Buffer.byteLength(JSON.stringify(result), "utf8") > 262144
          )
            throw new McpTransportError("TOOL_LIMIT");
        });
      }
      return result;
    },
    async checkPinned(
      scope: SpaceScope,
      agentId: AgentId,
      pins: { serverId: string; fingerprint: string }[],
      runId?: string,
    ) {
      const enabled = new Set(await repository.enabled(scope, agentId));
      for (const pin of pins) {
        if (!enabled.has(pin.serverId)) throw new McpServerError("NOT_FOUND");
        if ((await mcpServerFingerprint(await available(scope, pin.serverId))) !== pin.fingerprint)
          throw new McpServerError("NOT_FOUND");
        if (runId) await withConnection(scope, pin.serverId, runId, async () => {});
      }
    },
    async call(
      scope: SpaceScope,
      agentId: AgentId,
      runId: string,
      pin: { serverId: string; fingerprint: string },
      remoteName: string,
      args: Record<string, unknown>,
      signal: AbortSignal,
    ) {
      await this.checkPinned(scope, agentId, [pin]);
      return withConnection(scope, pin.serverId, runId, async (server, headers) => {
        guard(args, mcpProtectedValues(headers));
        const result = await transport.callTool(
          { url: server.url, headers },
          remoteName,
          args,
          signal,
        );
        guard(result, mcpProtectedValues(headers));
        return result;
      });
    },
  };
}
export type McpServersService = ReturnType<typeof createMcpServers>;
