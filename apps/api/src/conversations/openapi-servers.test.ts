import { expect, it, vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { OpenApiServerConfiguration } from "@raypx/core/openapi-servers";
import type { SpaceScope } from "@raypx/spaces/server";
import type { OpenApiTransport } from "@raypx/providers/openapi";
import {
  createOpenApiServers,
  OpenApiServerError,
  type OpenApiServersRepository,
  type StoredOpenApiServer,
} from "./openapi-servers.js";
import { applicationSecretKeyProvider } from "./secrets.js";
import type { SealedSecret } from "./secret-types.js";
const document = JSON.stringify({
  openapi: "3.1.0",
  paths: {
    "/items": {
      get: { operationId: "read", summary: "Read items" },
      post: { operationId: "create", summary: "Create item" },
    },
  },
});
const configuration: OpenApiServerConfiguration = {
  name: "Reports",
  url: "https://api.example.test",
  selectedOperationIds: ["read", "create"],
  availability: { mode: "all" },
};
function scope(id = "a", role: "owner" | "member" = "owner"): SpaceScope {
  const spaceId = spaceIdSchema.parse(id);
  return {
    spaceId,
    member: { spaceId, accountId: role, role, createdAt: "2026-11-14T00:00:00.000Z" },
  } as SpaceScope;
}
function fixture() {
  const rows = new Map<string, StoredOpenApiServer>();
  const sealed = new Map<string, SealedSecret>();
  function get(selected: SpaceScope, id: string) {
    const row = rows.get(id);
    if (!row || row.spaceId !== selected.spaceId) throw new OpenApiServerError("NOT_FOUND");
    return structuredClone(row);
  }
  const repository: OpenApiServersRepository = {
    async list(selected) {
      return [...rows.values()]
        .filter((row) => row.spaceId === selected.spaceId)
        .map((row) => structuredClone(row));
    },
    async get(selected, id) {
      return get(selected, id);
    },
    async create(_selected, row, secret) {
      rows.set(row.id, structuredClone(row));
      sealed.set(row.secretId, secret);
      return row;
    },
    async update(selected, row, secret) {
      get(selected, row.id);
      rows.set(row.id, structuredClone(row));
      if (secret) sealed.set(row.secretId, secret);
      return row;
    },
    async delete(selected, id) {
      const row = get(selected, id);
      rows.delete(id);
      sealed.delete(row.secretId);
      return { deleted: true };
    },
    async readSecret(selected, id, secretId) {
      get(selected, id);
      return sealed.get(secretId)!;
    },
  };
  const transport: OpenApiTransport = {
    validate: vi.fn(),
    fetchDocument: vi.fn(async () => document),
    test: vi.fn(async () => {}),
    call: vi.fn(async () => ({
      status: 200,
      content: "outside data",
      isError: false,
      truncated: false,
    })),
  };
  return {
    rows,
    sealed,
    transport,
    service: createOpenApiServers(
      repository,
      applicationSecretKeyProvider("openapi-isolated-unit-wrapping-key"),
      transport,
    ),
  };
}
it("stores encrypted write-only credentials and makes selected operations available to Space member Runs", async () => {
  const f = fixture();
  const credential = 'private-"-\\-token';
  const server = await f.service.create(
    scope(),
    configuration,
    { document },
    { type: "bearer", value: credential },
  );
  expect(server.hasCredentials).toBe(true);
  const catalog = await f.service.catalog(
    scope("a", "member"),
    agentIdSchema.parse("agent"),
    "run",
    new AbortController().signal,
  );
  expect(catalog[0]?.tools).toHaveLength(2);
  expect(
    JSON.stringify([server, await f.service.list(scope()), catalog, [...f.sealed.values()]]),
  ).not.toContain(credential);
  expect(f.service.protectedValues()).toContain(credential);
  expect(await f.service.test(scope(), server.id)).toMatchObject({ code: "SUCCEEDED" });
  await f.service.call(
    scope("a", "member"),
    agentIdSchema.parse("agent"),
    "run",
    catalog[0]!,
    "read",
    {},
    new AbortController().signal,
  );
  expect(f.transport.call).toHaveBeenCalledWith(
    configuration.url,
    { authorization: `Bearer ${credential}` },
    expect.objectContaining({ operationId: "read" }),
    {},
    expect.any(AbortSignal),
  );
  f.service.release("run");
  expect(f.service.protectedValues()).toEqual([]);
});
it("fetches source only once and keeps registration/management owner-only and Space-scoped", async () => {
  const f = fixture();
  const server = await f.service.create(scope(), configuration, {
    url: "https://spec.example.test/openapi",
  });
  await f.service.update(scope(), server.id, { ...configuration, selectedOperationIds: ["read"] });
  expect(f.transport.fetchDocument).toHaveBeenCalledTimes(1);
  expect(await f.service.list(scope("a", "member"))).toHaveLength(1);
  await expect(
    f.service.create(scope("a", "member"), configuration, { document }),
  ).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
  await expect(f.service.test(scope("b"), server.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    f.service.update(scope(), server.id, { ...configuration, url: "https://other.test" }),
  ).rejects.toMatchObject({ code: "INVALID_SERVER" });
});
it("rechecks selected Agent availability and frozen operations before dispatch", async () => {
  const f = fixture();
  const agent = agentIdSchema.parse("agent");
  const server = await f.service.create(scope(), configuration, { document });
  const [pin] = await f.service.catalog(scope(), agent, "run", new AbortController().signal);
  await f.service.update(scope(), server.id, {
    ...configuration,
    availability: { mode: "selected", agentIds: [] },
  });
  await expect(
    f.service.call(scope(), agent, "run", pin!, "read", {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.transport.call).not.toHaveBeenCalled();
});
it.each([
  "Host",
  "Cookie",
  "Content-Length",
  "Connection",
  "proxy-authorization",
  "sec-fetch-site",
  "x-forwarded-host",
])("refuses unsafe API key header %s", async (header) => {
  const f = fixture();
  await expect(
    f.service.create(
      scope(),
      configuration,
      { document },
      { type: "apiKey", header, value: "private-secret" },
    ),
  ).rejects.toMatchObject({ code: "CREDENTIALS_REJECTED" });
  expect(f.rows.size).toBe(0);
});
it("refuses credentials in operation metadata and response content before persistence/model context", async () => {
  const f = fixture();
  const token = 'private-"-token';
  await expect(
    f.service.create(
      scope(),
      configuration,
      { document: document.replace("Read items", token.replaceAll('"', '\\"')) },
      { type: "bearer", value: token },
    ),
  ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
  const server = await f.service.create(
    scope(),
    configuration,
    { document },
    { type: "bearer", value: token },
  );
  const agent = agentIdSchema.parse("agent");
  const [pin] = await f.service.catalog(scope(), agent, "run", new AbortController().signal);
  vi.mocked(f.transport.call).mockResolvedValue({
    status: 200,
    content: token,
    isError: false,
    truncated: false,
  });
  await expect(
    f.service.call(scope(), agent, "run", pin!, "read", {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
  expect(JSON.stringify(server)).not.toContain(token);
});
