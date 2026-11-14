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
        id: row?.id ?? crypto.randomUUID(),
        spaceId: scope.spaceId,
        scope: "team",
        agentId: null,
        provider: "memory",
        state: operation === "start" ? "starting" : "stopping",
        generation: (row?.generation ?? 0) + (operation === "start" ? 1 : 0),
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
it("accepts an already completed locked claim without repeating provider lifecycle work", async () => {
  const f = fixture();
  const provider = createMemoryComputerProvider();
  const service = createComputersService(f.repository, provider, "memory");
  await service.start(scope);
  const provision = vi.spyOn(provider, "provision");
  const stop = vi.spyOn(provider, "stop");
  const complete = vi.mocked(f.repository.complete);
  const original = f.row()!;
  vi.mocked(f.repository.get).mockResolvedValue({ ...original, state: "stopped" });
  vi.mocked(f.repository.claim).mockResolvedValue(original);
  expect(await service.start(scope)).toEqual({ status: "available", computer: original });
  expect(provision).not.toHaveBeenCalled();
  const stopped = { ...original, state: "stopped" as const };
  vi.mocked(f.repository.get).mockResolvedValue(original);
  vi.mocked(f.repository.claim).mockResolvedValue(stopped);
  expect(await service.stop(scope)).toEqual({ status: "available", computer: stopped });
  expect(stop).not.toHaveBeenCalled();
  expect(complete).toHaveBeenCalledTimes(1);
});

it("does not allocate or start compute for file reads in unavailable states", async () => {
  const f = fixture();
  const unconfigured = createComputersService(f.repository, null);
  expect(await unconfigured.listDirectory(scope, ".", 10)).toEqual({ status: "not-configured" });
  expect(await unconfigured.readFile(scope, "note", 10)).toEqual({ status: "not-configured" });
  expect(f.repository.get).not.toHaveBeenCalled();
  const provider = createMemoryComputerProvider();
  const provision = vi.spyOn(provider, "provision");
  const service = createComputersService(f.repository, provider);
  expect(await service.listDirectory(scope, ".", 10)).toEqual({
    status: "not-running",
    state: null,
  });
  expect(await service.readFile(scope, "note", 10)).toEqual({ status: "not-running", state: null });
  await service.start(scope);
  await service.stop(scope);
  expect(await service.readFile(scope, "note", 10)).toEqual({
    status: "not-running",
    state: "stopped",
  });
  expect(provision).toHaveBeenCalledTimes(1);
  expect(f.repository.claim).toHaveBeenCalledTimes(2);
});

it("bounds entries and bytes, detects text and binary and refuses escaped paths", async () => {
  const f = fixture();
  const provider = createMemoryComputerProvider();
  const service = createComputersService(f.repository, provider);
  await service.start(scope);
  const ref = { id: f.row()!.id, generation: f.row()!.generation };
  await provider.write(ref, "a", Buffer.from("hello world").toString("base64"));
  await provider.write(ref, "b", Buffer.from([0, 1, 255]).toString("base64"));
  await provider.write(ref, "c", Buffer.from("中").toString("base64"));
  expect(await service.listDirectory(scope, ".", 1)).toEqual({
    status: "available",
    entries: [{ path: "a", kind: "file" }],
    truncated: true,
  });
  expect(await service.readFile(scope, "a", 5)).toEqual({
    status: "available",
    bytes: Buffer.from("hello").toString("base64"),
    size: 11,
    truncated: true,
    contentType: "text",
  });
  expect(await service.readFile(scope, "b", 10)).toEqual({
    status: "available",
    bytes: "AAH/",
    size: 3,
    truncated: false,
    contentType: "binary",
  });
  expect(await service.readFile(scope, "c", 2)).toMatchObject({
    truncated: true,
    contentType: "text",
  });
  await provider.write(ref, "empty", "");
  expect(await service.readFile(scope, "empty", 1)).toMatchObject({
    size: 0,
    bytes: "",
    contentType: "text",
  });
  for (const path of ["../escape", "/etc/passwd", "a/../../escape", "bad\\path", "bad\0path"]) {
    await expect(service.readFile(scope, path, 10)).rejects.toMatchObject({
      code: "FILE_PATH_REFUSED",
    });
    await expect(service.listDirectory(scope, path, 10)).rejects.toMatchObject({
      code: "FILE_PATH_REFUSED",
    });
  }
  const process = await provider.execute(ref, {
    executable: "ln",
    argv: ["-s", "/tmp", "escape"],
    cwd: ".",
    environment: {},
    outputBudget: 1,
  });
  const processEvents = [];
  for await (const event of process.events) processEvents.push(event);
  expect(processEvents).toContainEqual(expect.objectContaining({ kind: "exit", status: 0 }));
  await expect(service.readFile(scope, "escape/outside", 10)).rejects.toMatchObject({
    code: "FILE_PATH_REFUSED",
  });
  await expect(service.listDirectory(scope, "escape", 10)).rejects.toMatchObject({
    code: "FILE_PATH_REFUSED",
  });
  await expect(service.readFile(scope, "missing", 10)).rejects.toMatchObject({
    code: "FILE_NOT_FOUND",
  });
  await expect(service.readFile(scope, "a", 65537)).rejects.toMatchObject({ code: "FILE_LIMIT" });
});

it("reports a provider without member previews explicitly", async () => {
  const f = fixture();
  const provider = createMemoryComputerProvider();
  delete provider.readFile;
  const service = createComputersService(f.repository, provider);
  await service.start(scope);
  expect(await service.readFile(scope, "a", 10)).toEqual({
    status: "unavailable",
    code: "FILES_UNAVAILABLE",
  });
});
