import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { testSession } from "../helpers/session.js";
import { SpaceNotFound, spaceIdSchema } from "@raypx/core/spaces";
import { openApiServerSchema } from "@raypx/core/openapi-servers";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { createApiApp } from "../helpers/app.js";
import { createApiLogging } from "../../src/logging.js";
import {
  OpenApiServerError,
  type OpenApiServersService,
} from "../../src/conversations/openapi-servers.js";
const spaceId = spaceIdSchema.parse("api-rpc-space");
const id = "00000000-0000-4000-8000-000000000001";
const configuration = {
  name: "Reports",
  url: "https://api.example.test",
  selectedOperationIds: ["read"],
  availability: { mode: "all" as const },
};
const server = openApiServerSchema.parse({
  ...configuration,
  id,
  spaceId,
  operations: [
    { operationId: "read", label: "Read items", method: "GET", path: "/items", readOnly: true },
  ],
  hasCredentials: true,
  createdAt: "2026-11-14T00:00:00.000Z",
  updatedAt: "2026-11-14T00:00:00.000Z",
});
it("resolves fresh membership for every API command and strips credentials from replies/logs/errors", async () => {
  const actor = "openapi-rpc-owner";
  const scope = resolveSpaceScope(
    { spaceId, accountId: actor, role: "owner", createdAt: server.createdAt },
    actor,
    spaceId,
  );
  let admitted = true;
  const resolve = vi.fn(async () => {
    if (!admitted) throw new SpaceNotFound();
    return scope;
  });
  const create = vi.fn<OpenApiServersService["create"]>(
    async (selected, input, source, credential) => {
      expect(selected).toBe(scope);
      expect(input).toEqual(configuration);
      expect(source).toEqual({ document: "source-body-private" });
      expect(credential).toEqual({ type: "bearer", value: "rpc-private-credential" });
      return server;
    },
  );
  const list = vi.fn(async () => [server]);
  const service = {
    list,
    create,
    update: vi.fn(async () => server),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({ code: "SUCCEEDED" as const, operationIds: ["read"] })),
  } as unknown as OpenApiServersService;
  const logs: unknown[] = [];
  const logger = createApiLogging({
    environment: "test",
    sink: (entry) => {
      logs.push(entry);
    },
  });
  const app = createApiApp({
    spaces: {
      resolve,
      async list() {
        return [];
      },
      async create() {
        throw new Error("Unexpected Space creation");
      },
    },
    openApiServers: service,
    readSession: async () => testSession(actor),
    allowedOrigins: ["https://web.example.test"],
    logger,
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  try {
    const saved = await client.openApiServers.create({
      spaceId,
      server: configuration,
      source: { document: "source-body-private" },
      credential: { type: "bearer", value: "rpc-private-credential" },
    });
    expect(saved).toEqual(server);
    await client.openApiServers.list({ spaceId });
    await client.openApiServers.update({ spaceId, id, server: configuration });
    await client.openApiServers.test({ spaceId, id });
    await client.openApiServers.delete({ spaceId, id });
    expect(resolve).toHaveBeenCalledTimes(5);
    create.mockRejectedValueOnce(new Error("rpc-private-credential source-body-private"));
    await expect(
      client.openApiServers.create({
        spaceId,
        server: configuration,
        source: { document: "source-body-private" },
      }),
    ).rejects.toMatchObject({ message: "OPENAPI_OPERATION_FAILED" });
    admitted = false;
    await expect(client.openApiServers.list({ spaceId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(list).toHaveBeenCalledTimes(1);
    await logger.flush();
    const emitted = JSON.stringify([saved, logs]);
    expect(logs.length).toBeGreaterThan(0);
    expect(emitted).not.toContain("rpc-private-credential");
    expect(emitted).not.toContain("source-body-private");
    expect(emitted).not.toContain("secretId");
  } finally {
    await logger.close();
  }
});
it("returns stable refusal codes without disclosing raw backend errors", async () => {
  const actor = "api-owner";
  const scope = resolveSpaceScope(
    { spaceId, accountId: actor, role: "member", createdAt: server.createdAt },
    actor,
    spaceId,
  );
  const app = createApiApp({
    spaces: {
      async resolve() {
        return scope;
      },
      async list() {
        return [];
      },
      async create() {
        throw new Error("Unexpected");
      },
    },
    openApiServers: {
      async create() {
        throw new OpenApiServerError("OWNER_REQUIRED");
      },
    } as unknown as OpenApiServersService,
    readSession: async () => testSession(actor),
    allowedOrigins: ["https://web.example.test"],
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  await expect(
    client.openApiServers.create({ spaceId, server: configuration, source: { document: "{}" } }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "OWNER_REQUIRED" });
});
