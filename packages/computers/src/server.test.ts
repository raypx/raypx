import { expect, it, vi } from "vitest";
import { computerSchema, type Computer } from "@raypx/core/computers";
import type { SpaceScope } from "@raypx/spaces/server";
import { createMemoryComputerProvider, ComputerError } from "@raypx/providers/computer";
import { createComputersService, type ComputersRepository } from "./server.js";
const scope = { spaceId: "space", member: { accountId: "member" } } as SpaceScope;
function fixture() {
  const now = new Date().toISOString();
  let row: Computer | null = null;
  const repository: ComputersRepository = {
    get: vi.fn<ComputersRepository["get"]>(async () => row),
    claim: vi.fn<ComputersRepository["claim"]>(async (_, operation) => {
      row = computerSchema.parse({
        id: crypto.randomUUID(),
        spaceId: scope.spaceId,
        scope: "team",
        agentId: null,
        provider: "memory",
        state: operation === "start" ? "starting" : "stopping",
        generation: (row?.generation ?? 0) + 1,
        homeRevision: row?.homeRevision ?? null,
        leaseOwner: "operation",
        leaseExpiresAt: now,
        leaseFence: 1,
        failureCode: null,
        createdAt: now,
        updatedAt: now,
      });
      return row;
    }),
    complete: vi.fn<ComputersRepository["complete"]>(async (_, claim, result) => {
      row = { ...claim, ...result, leaseOwner: null, leaseExpiresAt: null };
      return row;
    }),
  };
  return { repository, row: () => row };
}
it("leaves all persistence and providers unused when no computer is configured", async () => {
  const f = fixture();
  const service = createComputersService(f.repository, null);
  for (const call of [service.get, service.start, service.stop])
    expect(await call(scope)).toEqual({ status: "not-configured" });
  expect(f.repository.get).not.toHaveBeenCalled();
  expect(f.repository.claim).not.toHaveBeenCalled();
});
it("reads without allocating and starts exactly the claimed team computer", async () => {
  const f = fixture();
  const provider = createMemoryComputerProvider();
  const provision = vi.spyOn(provider, "provision");
  const service = createComputersService(f.repository, provider, "memory");
  expect(await service.get(scope)).toEqual({ status: "available", computer: null });
  await service.start(scope);
  expect(provision).toHaveBeenCalledWith({ id: f.row()!.id, generation: f.row()!.generation });
  expect(f.repository.complete).toHaveBeenCalledWith(
    scope,
    expect.objectContaining({ leaseOwner: "operation" }),
    expect.objectContaining({ state: "running" }),
  );
  await service.start(scope);
  expect(provision).toHaveBeenCalledTimes(1);
});
it("commits a safe failure while preserving the known revision", async () => {
  const f = fixture();
  const provider = createMemoryComputerProvider();
  vi.spyOn(provider, "provision").mockRejectedValue(new ComputerError("RESTORE_FAILED"));
  await createComputersService(f.repository, provider).start(scope);
  expect(f.row()).toMatchObject({
    state: "failed",
    failureCode: "RESTORE_FAILED",
    homeRevision: null,
    leaseOwner: null,
  });
});
