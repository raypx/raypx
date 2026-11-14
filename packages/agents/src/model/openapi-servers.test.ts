import { expect, it, vi } from "vitest";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { openApiServerSchema } from "@raypx/core/openapi-servers";
import {
  OpenApiServersController,
  OpenApiSecret,
  createOpenApiServerDraft,
  type OpenApiServersPort,
} from "./openapi-servers.js";
const time = "2026-11-14T00:00:00Z";
const space = spaceSchema.parse({ id: "owned", name: "Owned", createdAt: time, updatedAt: time });
const membership = {
  space,
  member: spaceMemberSchema.parse({
    spaceId: space.id,
    accountId: "member",
    role: "owner",
    createdAt: time,
  }),
};
const server = openApiServerSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  spaceId: space.id,
  name: "Inventory",
  url: "https://api.example.test",
  operations: [
    {
      operationId: "listItems",
      label: "List items",
      method: "GET",
      path: "/items",
      readOnly: true,
    },
  ],
  selectedOperationIds: ["listItems"],
  availability: { mode: "all" },
  hasCredentials: true,
  createdAt: time,
  updatedAt: time,
});
function fixture() {
  const port: OpenApiServersPort = {
    list: vi.fn(async () => [server]),
    create: vi.fn(async () => server),
    update: vi.fn(async () => server),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({ code: "SUCCEEDED" as const, operationIds: ["listItems"] })),
  };
  const directory = {
    spaces: {
      list: vi.fn(async () => [
        membership,
        {
          ...membership,
          space: { ...space, id: spaceSchema.shape.id.parse("member-space") },
          member: { ...membership.member, role: "member" as const },
        },
      ]),
    },
    agents: { list: vi.fn(async () => []) },
  };
  return { port, directory, controller: new OpenApiServersController(port, directory) };
}
it("consumes credential bytes on every submission and keeps them out of drafts", () => {
  const secret = new OpenApiSecret();
  secret.set("private-key");
  expect(secret.take("apiKey", "X-Key")).toEqual({
    type: "apiKey",
    header: "X-Key",
    value: "private-key",
  });
  expect(() => secret.take("apiKey", "X-Key")).toThrow("INVALID_CREDENTIAL");
  secret.set("secret");
  expect(() => secret.take("apiKey", "invalid header")).toThrow("INVALID_CREDENTIAL");
  expect(() => secret.take("bearer", "")).toThrow("INVALID_CREDENTIAL");
  secret.set("secret");
  secret.clear();
  expect(secret.take("keep", "")).toBeUndefined();
  expect(createOpenApiServerDraft(server)).not.toHaveProperty("credential");
});
it("only loads owned Spaces, scopes requests and never projects submitted credentials", async () => {
  const { port, controller } = fixture();
  await controller.load();
  expect(controller.getSnapshot().spaces).toEqual([membership]);
  expect(port.list).toHaveBeenCalledWith({ spaceId: space.id });
  await controller.save(server.id, createOpenApiServerDraft(server), undefined, {
    type: "bearer",
    value: "private-key",
  });
  expect(port.update).toHaveBeenCalledWith({
    spaceId: space.id,
    id: server.id,
    server: createOpenApiServerDraft(server),
    credential: { type: "bearer", value: "private-key" },
  });
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("private-key");
  await controller.save(server.id, createOpenApiServerDraft(server));
  expect(port.update).toHaveBeenLastCalledWith({
    spaceId: space.id,
    id: server.id,
    server: createOpenApiServerDraft(server),
  });
  await controller.test(server.id);
  expect(controller.getSnapshot().results[server.id]?.code).toBe("SUCCEEDED");
  await controller.remove(server.id);
  expect(port.delete).toHaveBeenCalledWith({ spaceId: space.id, id: server.id });
  expect(controller.getSnapshot().servers).toEqual([]);
});
it("discards an earlier Space completion after a new selection", async () => {
  const { controller, port, directory } = fixture();
  const other = { ...membership, space: { ...space, id: spaceSchema.shape.id.parse("other") } };
  directory.spaces.list.mockResolvedValue([membership, other]);
  await controller.load();
  let finish: ((value: (typeof server)[]) => void) | undefined;
  vi.mocked(port.list).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = controller.selectSpace(space.id);
  await controller.selectSpace(other.space.id);
  finish?.([{ ...server, name: "Old Space" }]);
  await first;
  expect(controller.getSnapshot().spaceId).toBe(other.space.id);
  expect(controller.getSnapshot().servers[0]?.name).toBe("Inventory");
});
it("retains a safe retryable failure without raw server diagnostics", async () => {
  const { port, controller } = fixture();
  await controller.load();
  vi.mocked(port.create).mockRejectedValue(new Error("private credential"));
  expect(
    await controller.save(null, createOpenApiServerDraft(null), { document: "{}" }),
  ).toBeNull();
  expect(controller.getSnapshot().error).toBe("save");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("private credential");
});
