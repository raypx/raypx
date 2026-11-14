import { protectedHeaderSchema, scrubProtectedValue } from "@raypx/core/protected-input";
import type { AgentId } from "@raypx/core/agents";
import {
  openApiCredentialSchema,
  openApiServerConfigurationSchema,
  openApiServerSchema,
  type OpenApiCredential,
  type OpenApiServer,
  type OpenApiServerConfiguration,
  type OpenApiSource,
  type OpenApiTestCode,
} from "@raypx/core/openapi-servers";
import {
  OpenApiDocumentError,
  OpenApiTransportError,
  parseOpenApiDocument,
  type OpenApiToolOperation,
  type OpenApiTransport,
} from "@raypx/providers/openapi";
import type { SpaceScope } from "@raypx/spaces/server";
import type { SealedSecret, SecretKeyProvider } from "./secret-types.js";
import { openStoredSecret, sealStoredSecret } from "./secret-envelope.js";
export class OpenApiServerError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "OWNER_REQUIRED"
      | "INVALID_SERVER"
      | "SERVER_LIMIT"
      | "CREDENTIALS_REJECTED"
      | "INVALID_DOCUMENT"
      | "DOCUMENT_TOO_LARGE"
      | "OPERATION_LIMIT"
      | "SCHEMA_DEPTH"
      | "UNSUPPORTED_SCHEMA"
      | "OPERATION_FAILED",
  ) {
    super(code);
  }
}
export interface StoredOpenApiServer extends OpenApiServer {
  secretId: string;
  credentialOwnerId: string;
  toolOperations: OpenApiToolOperation[];
}
export interface OpenApiServersRepository {
  list(scope: SpaceScope): Promise<StoredOpenApiServer[]>;
  get(scope: SpaceScope, id: string): Promise<StoredOpenApiServer>;
  create(
    scope: SpaceScope,
    server: StoredOpenApiServer,
    secret: SealedSecret,
  ): Promise<StoredOpenApiServer>;
  update(
    scope: SpaceScope,
    server: StoredOpenApiServer,
    secret?: SealedSecret,
  ): Promise<StoredOpenApiServer>;
  delete(scope: SpaceScope, id: string): Promise<{ deleted: true }>;
  readSecret(scope: SpaceScope, id: string, secretId: string): Promise<SealedSecret>;
}
function publicServer(row: StoredOpenApiServer): OpenApiServer {
  const { secretId: _secretId, credentialOwnerId: _owner, toolOperations: _tools, ...server } = row;
  return openApiServerSchema.parse(server);
}
function requireOwner(scope: SpaceScope) {
  if (scope.member.role !== "owner") throw new OpenApiServerError("OWNER_REQUIRED");
}
const RESERVED_HEADERS = new Set([
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
]);
function credentialHeaders(input: OpenApiCredential): Record<string, string> {
  const parsed = openApiCredentialSchema.safeParse(input);
  if (!parsed.success) throw new OpenApiServerError("CREDENTIALS_REJECTED");
  if (parsed.data.type === "none") return {};
  if (parsed.data.type === "bearer") return { authorization: `Bearer ${parsed.data.value}` };
  const header = parsed.data.header.toLowerCase();
  if (
    RESERVED_HEADERS.has(header) ||
    header.startsWith("sec-") ||
    header.startsWith("proxy-") ||
    header.startsWith("x-forwarded-")
  )
    throw new OpenApiServerError("CREDENTIALS_REJECTED");
  return { [header]: parsed.data.value };
}
function secrets(headers: Record<string, string>) {
  return Object.values(headers)
    .flatMap((value) => [value, value.replace(/^Bearer /, "")])
    .filter(Boolean);
}
function guard(value: unknown, values: readonly string[]) {
  function contains(candidate: unknown): boolean {
    if (typeof candidate === "string")
      return values.some((secret) => secret && candidate.includes(secret));
    if (Array.isArray(candidate)) return candidate.some(contains);
    if (!candidate || typeof candidate !== "object") return false;
    return Object.entries(candidate).some(([key, child]) => contains(key) || contains(child));
  }
  if (contains(value)) throw new OpenApiServerError("OPERATION_FAILED");
}
async function openApiFingerprint(server: StoredOpenApiServer) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([server.id, server.url, server.selectedOperationIds, server.toolOperations]),
    ),
  );
  return Buffer.from(bytes).toString("hex");
}
export function createOpenApiServers(
  repository: OpenApiServersRepository,
  keys: SecretKeyProvider,
  transport: OpenApiTransport,
) {
  const activeSecrets = new Map<string, string[]>();
  function validate(input: OpenApiServerConfiguration) {
    const parsed = openApiServerConfigurationSchema.safeParse(input);
    if (!parsed.success) throw new OpenApiServerError("INVALID_SERVER");
    try {
      transport.validate(parsed.data.url);
    } catch {
      throw new OpenApiServerError("INVALID_SERVER");
    }
    return parsed.data;
  }
  async function headers(scope: SpaceScope, row: StoredOpenApiServer, runId?: string) {
    const sealed = await repository.readSecret(scope, row.id, row.secretId);
    const credential = JSON.parse(
      await openStoredSecret(keys, row.credentialOwnerId, row.secretId, sealed),
    ) as OpenApiCredential;
    const result = credentialHeaders(credential);
    if (runId)
      activeSecrets.set(runId, [
        ...new Set([...(activeSecrets.get(runId) ?? []), ...secrets(result)]),
      ]);
    return result;
  }
  function selected(row: StoredOpenApiServer, agentId: AgentId) {
    return row.availability.mode === "all" || row.availability.agentIds.includes(agentId);
  }
  return {
    protectedValues: () => [...activeSecrets.values()].flat(),
    release(runId: string) {
      activeSecrets.delete(runId);
    },
    async list(scope: SpaceScope) {
      return (await repository.list(scope)).map(publicServer);
    },
    async create(
      scope: SpaceScope,
      input: OpenApiServerConfiguration,
      source: OpenApiSource,
      credential: OpenApiCredential = { type: "none" },
    ) {
      requireOwner(scope);
      const parsed = validate(input);
      const suppliedHeaders = credentialHeaders(credential);
      let toolOperations: OpenApiToolOperation[];
      try {
        const document =
          "document" in source
            ? source.document
            : await transport.fetchDocument(source.url, new AbortController().signal);
        toolOperations = parseOpenApiDocument(document);
      } catch (error) {
        if (error instanceof OpenApiDocumentError) throw new OpenApiServerError(error.code);
        throw new OpenApiServerError("INVALID_DOCUMENT");
      }
      if (
        parsed.selectedOperationIds.some(
          (id) => !toolOperations.some((operation) => operation.operationId === id),
        )
      )
        throw new OpenApiServerError("INVALID_SERVER");
      const id = crypto.randomUUID();
      const secretId = crypto.randomUUID();
      const now = new Date().toISOString();
      const row: StoredOpenApiServer = {
        ...parsed,
        id,
        spaceId: scope.spaceId,
        secretId,
        credentialOwnerId: scope.member.accountId,
        toolOperations,
        operations: toolOperations.map(({ operationId, label, method, path, readOnly }) => ({
          operationId,
          label,
          method,
          path,
          readOnly,
        })),
        hasCredentials: credential.type !== "none",
        createdAt: now,
        updatedAt: now,
      };
      guard(row, secrets(suppliedHeaders));
      return publicServer(
        await repository.create(
          scope,
          row,
          await sealStoredSecret(keys, row.credentialOwnerId, secretId, JSON.stringify(credential)),
        ),
      );
    },
    async update(
      scope: SpaceScope,
      id: string,
      input: OpenApiServerConfiguration,
      credential?: OpenApiCredential,
    ) {
      requireOwner(scope);
      const current = await repository.get(scope, id);
      const parsed = validate(input);
      // Endpoint identity is intentionally immutable. Re-register to change host or document.
      if (
        parsed.url !== current.url ||
        parsed.selectedOperationIds.some(
          (operationId) =>
            !current.operations.some((operation) => operation.operationId === operationId),
        )
      )
        throw new OpenApiServerError("INVALID_SERVER");
      const suppliedHeaders =
        credential === undefined ? await headers(scope, current) : credentialHeaders(credential);
      const row = {
        ...current,
        ...parsed,
        hasCredentials:
          credential === undefined ? current.hasCredentials : credential.type !== "none",
        updatedAt: new Date().toISOString(),
      };
      guard(row, secrets(suppliedHeaders));
      const sealed =
        credential === undefined
          ? undefined
          : await sealStoredSecret(
              keys,
              current.credentialOwnerId,
              current.secretId,
              JSON.stringify(credential),
            );
      return publicServer(await repository.update(scope, row, sealed));
    },
    async delete(scope: SpaceScope, id: string) {
      requireOwner(scope);
      return repository.delete(scope, id);
    },
    async test(
      scope: SpaceScope,
      id: string,
    ): Promise<{ code: OpenApiTestCode; operationIds: string[] }> {
      requireOwner(scope);
      const row = await repository.get(scope, id);
      try {
        await transport.test(row.url, await headers(scope, row), new AbortController().signal);
        return {
          code: "SUCCEEDED",
          operationIds: row.operations.map((operation) => operation.operationId),
        };
      } catch (error) {
        return {
          code:
            error instanceof OpenApiTransportError && error.code !== "INVALID_ARGUMENTS"
              ? error.code
              : "REQUEST_FAILED",
          operationIds: [],
        };
      }
    },
    async catalog(scope: SpaceScope, agentId: AgentId, runId: string, _signal: AbortSignal) {
      const rows = (await repository.list(scope)).filter((row) => selected(row, agentId));
      const result: {
        serverId: string;
        fingerprint: string;
        url: string;
        tools: OpenApiToolOperation[];
      }[] = [];
      for (const row of rows) {
        const values = secrets(await headers(scope, row, runId));
        const item = {
          serverId: row.id,
          fingerprint: await openApiFingerprint(row),
          url: row.url,
          tools: row.toolOperations.filter((operation) =>
            row.selectedOperationIds.includes(operation.operationId),
          ),
        };
        guard(item, values);
        result.push(item);
      }
      if (
        result.reduce((count, row) => count + row.tools.length, 0) > 128 ||
        Buffer.byteLength(JSON.stringify(result), "utf8") > 262144
      )
        throw new OpenApiServerError("OPERATION_LIMIT");
      return result;
    },
    async checkPinned(
      scope: SpaceScope,
      agentId: AgentId,
      pins: { serverId: string; fingerprint: string }[],
      runId?: string,
    ) {
      for (const pin of pins) {
        const row = await repository.get(scope, pin.serverId);
        if (!selected(row, agentId) || (await openApiFingerprint(row)) !== pin.fingerprint)
          throw new OpenApiServerError("NOT_FOUND");
        await headers(scope, row, runId);
      }
    },
    async call(
      scope: SpaceScope,
      agentId: AgentId,
      runId: string,
      pin: { serverId: string; fingerprint: string },
      operationId: string,
      args: Record<string, unknown>,
      signal: AbortSignal,
      protectedCredential?:
        | OpenApiCredential
        | { type: "query"; name: string; value: string }
        | { type: "basic"; value: string },
    ) {
      await this.checkPinned(scope, agentId, [pin], runId);
      const row = await repository.get(scope, pin.serverId);
      const operation = row.toolOperations.find(
        (item) =>
          item.operationId === operationId && row.selectedOperationIds.includes(operationId),
      );
      if (!operation) throw new OpenApiServerError("NOT_FOUND");
      let suppliedHeaders: Record<string, string>;
      let query: { name: string; value: string } | undefined;
      const values: string[] = [];
      if (protectedCredential?.type === "query") {
        if (
          !protectedHeaderSchema.safeParse(protectedCredential.name).success ||
          /[\r\n\0]/.test(protectedCredential.value)
        )
          throw new OpenApiServerError("CREDENTIALS_REJECTED");
        suppliedHeaders = {};
        query = { name: protectedCredential.name, value: protectedCredential.value };
        values.push(protectedCredential.value);
      } else if (protectedCredential?.type === "basic") {
        const separator = protectedCredential.value.indexOf(":");
        if (separator < 1 || /[\r\n\0]/.test(protectedCredential.value))
          throw new OpenApiServerError("CREDENTIALS_REJECTED");
        suppliedHeaders = {
          authorization: `Basic ${Buffer.from(protectedCredential.value).toString("base64")}`,
        };
        values.push(
          protectedCredential.value,
          protectedCredential.value.slice(0, separator),
          protectedCredential.value.slice(separator + 1),
        );
      } else
        suppliedHeaders = protectedCredential
          ? credentialHeaders(protectedCredential)
          : await headers(scope, row, runId);
      if (protectedCredential && "value" in protectedCredential)
        values.push(protectedCredential.value);
      guard(args, secrets(suppliedHeaders));
      const result = await transport.call(row.url, suppliedHeaders, operation, args, signal, {
        ...(query ? { query } : {}),
        protectedValues: values,
      });
      for (const value of values) result.content = scrubProtectedValue(result.content, value);
      guard(result, secrets(suppliedHeaders));
      return result;
    },
  };
}
export type OpenApiServersService = ReturnType<typeof createOpenApiServers>;
