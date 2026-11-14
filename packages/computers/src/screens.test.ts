import { expect, it, vi } from "vitest";
import { computerSchema, type ComputerScreenControl } from "@raypx/core/computers";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import type { ComputersRepository } from "./server.js";
import {
  ComputerScreenError,
  createComputerScreensService,
  type ComputerScreenRepository,
} from "./screens.js";

const scope = {
  spaceId: "screen-space",
  member: { accountId: "member", role: "owner" },
} as SpaceScope;
function fixture() {
  const provider = createMemoryComputerProvider();
  const time = new Date().toISOString();
  const computer = computerSchema.parse({
    id: crypto.randomUUID(),
    spaceId: scope.spaceId,
    scope: "team",
    agentId: null,
    provider: "memory",
    state: "running",
    generation: 1,
    homeRevision: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseFence: 0,
    failureCode: null,
    createdAt: time,
    updatedAt: time,
  });
  const computers: ComputersRepository = {
    get: vi.fn(async (value) => (value.spaceId === scope.spaceId ? computer : null)),
    claim: vi.fn(),
    complete: vi.fn(),
  };
  let control: ComputerScreenControl | null = null;
  const controls: ComputerScreenRepository = {
    openViewer: vi.fn(async () => undefined),
    touchViewer: vi.fn(async () => undefined),
    control: vi.fn(async () => control),
    acquire: vi.fn(async () => {
      control = {
        id: crypto.randomUUID(),
        accountId: "member",
        displayName: "Screen member",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      };
      return control;
    }),
    renew: vi.fn(async () => control!),
    release: vi.fn(async () => {
      control = null;
    }),
    forceRelease: vi.fn(async () => {
      control = null;
    }),
    releaseViewer: vi.fn(async () => {
      control = null;
    }),
    withMemberInput: vi.fn(async (_, __, grantId, operation) => {
      if (control?.id !== grantId) throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED");
      return operation();
    }),
    withAgentInput: vi.fn(async (_, __, operation) => {
      if (control) throw new ComputerScreenError("SCREEN_CONTROL_HELD", control);
      return operation();
    }),
    stop: vi.fn(async (_, __, operation) => {
      control = null;
      return operation();
    }),
  };
  const service = createComputerScreensService(computers, controls, provider, {
    recheckMs: 1,
    streamLifetimeMs: 2_000,
    frameIdleMs: 20,
  });
  const ref = { id: computer.id, generation: computer.generation };
  return { provider, computer, computers, controls, service, ref };
}
it("does not allocate an unconfigured, stopped or unsupported screen", async () => {
  const f = fixture();
  expect(
    await createComputerScreensService(f.computers, f.controls, null).availability(scope),
  ).toEqual({ status: "not-configured" });
  expect(f.computers.get).not.toHaveBeenCalled();
  f.computer.state = "stopped";
  expect(await f.service.availability(scope)).toEqual({ status: "not-running", state: "stopped" });
  f.computer.state = "running";
  delete f.provider.screen;
  expect(await f.service.availability(scope)).toEqual({
    status: "unavailable",
    code: "SCREEN_UNAVAILABLE",
  });
  expect(f.controls.control).not.toHaveBeenCalled();
});
it("keeps availability scoped and exposes role-derived force release", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  expect(await f.service.availability(scope)).toMatchObject({
    status: "available",
    running: false,
    canForceRelease: true,
    control: null,
  });
  expect(await f.service.availability({ ...scope, spaceId: "other" } as SpaceScope)).toEqual({
    status: "not-running",
    state: null,
  });
  const member = { ...scope, member: { ...scope.member, role: "member" } } as SpaceScope;
  expect(await f.service.availability(member)).toMatchObject({
    status: "available",
    canForceRelease: false,
  });
});
it("starts, acquires, gates input, renews and releases using the exact scoped computer", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  const viewerId = crypto.randomUUID();
  const state = await f.service.acquire(scope, viewerId);
  expect(state).toMatchObject({ status: "available", running: true, agentInputPaused: true });
  expect(f.controls.acquire).toHaveBeenCalledWith(scope, f.ref, viewerId);
  if (state.status !== "available" || !state.control) throw new Error("control missing");
  const input = vi.spyOn(f.provider, "input");
  await expect(
    f.service.input(scope, "not-the-grant", { kind: "text", text: "safe" }),
  ).rejects.toMatchObject({ code: "SCREEN_CONTROL_REQUIRED" });
  expect(input).not.toHaveBeenCalled();
  await f.service.input(scope, state.control.id, { kind: "text", text: "hello" });
  expect(input).toHaveBeenCalledWith(f.ref, { kind: "text", text: "hello" });
  await f.service.renew(scope, state.control.id);
  expect(f.controls.renew).toHaveBeenCalledWith(scope, f.ref, state.control.id);
  await expect(f.service.withAgentInput(scope, f.ref, async () => "input")).rejects.toMatchObject({
    code: "SCREEN_CONTROL_HELD",
  });
  await f.service.release(scope, state.control.id);
  expect(await f.service.withAgentInput(scope, f.ref, async () => "input")).toBe("input");
  await f.service.stop(scope);
  expect(f.controls.stop).toHaveBeenCalledWith(scope, f.ref, expect.any(Function));
});
it("refuses malformed or oversized input before invoking a provider", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  await expect(
    f.service.input(scope, "grant", { kind: "text", text: "x".repeat(4097) }),
  ).rejects.toMatchObject({ code: "SCREEN_INVALID_INPUT" });
  await expect(f.service.acquire(scope, "invalid-viewer")).rejects.toMatchObject({
    code: "SCREEN_INVALID_INPUT",
  });
  expect(f.controls.withMemberInput).not.toHaveBeenCalled();
});
it("rechecks admission before a frame and closes with the exact membership departure reason", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  const viewerId = crypto.randomUUID();
  const recheck = vi.fn(async (): Promise<SpaceScope> => {
    throw new SpaceNotFound("SPACE_MEMBER_REMOVED");
  });
  const events = [];
  for await (const event of f.service.stream(scope, { viewerId, recheck })) events.push(event);
  expect(events).toEqual([{ kind: "closed", reason: "SPACE_MEMBER_REMOVED" }]);
  expect(f.controls.releaseViewer).toHaveBeenCalledWith(scope, f.ref, viewerId);
});
it("streams bounded frames with live takeover state and releases only the disconnected viewer", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  const viewerId = crypto.randomUUID();
  const abort = new AbortController();
  const recheck = vi.fn(async () => scope);
  const iterable = f.service.stream(scope, { viewerId, signal: abort.signal, recheck });
  const stream = iterable[Symbol.asyncIterator]();
  expect((await stream.next()).value).toMatchObject({ kind: "state", state: { control: null } });
  expect((await stream.next()).value).toMatchObject({
    kind: "frame",
    frame: { mimeType: "image/png", width: 1024, height: 768 },
  });
  await f.service.acquire(scope, viewerId);
  expect((await stream.next()).value).toMatchObject({
    kind: "state",
    state: { control: { displayName: "Screen member" }, agentInputPaused: true },
  });
  abort.abort();
  expect((await stream.next()).done).toBe(true);
  expect(f.controls.releaseViewer).toHaveBeenCalledWith(scope, f.ref, viewerId);
  expect(recheck.mock.calls.length).toBeGreaterThanOrEqual(2);
});
it("closes an idle provider and oversized frames without retaining screen bytes", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  f.provider.streamScreen = async function* () {
    yield { sequence: 0, width: 1, height: 1, mimeType: "image/png", bytes: "a".repeat(2_000_000) };
  };
  const events = [];
  for await (const event of f.service.stream(scope, {
    viewerId: crypto.randomUUID(),
    recheck: async () => scope,
  }))
    events.push(event);
  expect(events.map((event) => event.kind)).toEqual(["state", "closed"]);
  expect(events.at(-1)).toEqual({ kind: "closed", reason: "SCREEN_UNAVAILABLE" });
  expect(JSON.stringify(events).length).toBeLessThan(2_000);
});
it("closes a stalled provider at the idle deadline while continuing fresh membership checks", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  f.provider.streamScreen = async function* (_, options) {
    await new Promise<void>((resolve) =>
      options?.signal?.addEventListener("abort", () => resolve(), { once: true }),
    );
    yield { sequence: 0, width: 1, height: 1, mimeType: "image/png", bytes: "AAAA" };
  };
  const recheck = vi.fn(async () => scope);
  const events = [];
  for await (const event of f.service.stream(scope, { viewerId: crypto.randomUUID(), recheck }))
    events.push(event);
  expect(events.at(-1)).toEqual({ kind: "closed", reason: "SCREEN_IDLE_TIMEOUT" });
  expect(events.some((event) => event.kind === "frame")).toBe(false);
  expect(recheck.mock.calls.length).toBeGreaterThan(1);
});
it("closes when the graphical session stops", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  const iterable = f.service.stream(scope, {
    viewerId: crypto.randomUUID(),
    recheck: async () => scope,
  });
  const iterator = iterable[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  await f.service.stop(scope);
  const events = [];
  for (let i = 0; i < 4; i += 1) {
    const next = await iterator.next();
    if (next.done) break;
    events.push(next.value);
  }
  expect(events).toContainEqual({ kind: "closed", reason: "SCREEN_STOPPED" });
  expect(events.at(-2)).toMatchObject({
    kind: "state",
    state: { status: "available", running: false },
  });
});
it("reports stop before checking the viewer registration deleted by that stop", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  vi.mocked(f.controls.openViewer).mockImplementation(async () => {
    await f.provider.stopScreen!(f.ref);
  });
  vi.mocked(f.controls.touchViewer).mockRejectedValue(
    new ComputerScreenError("SCREEN_CONTROL_REQUIRED"),
  );
  const events = [];
  for await (const event of f.service.stream(scope, {
    viewerId: crypto.randomUUID(),
    recheck: async () => scope,
  }))
    events.push(event);
  expect(events).toMatchObject([
    { kind: "state", state: { running: false } },
    { kind: "closed", reason: "SCREEN_STOPPED" },
  ]);
  expect(f.controls.touchViewer).not.toHaveBeenCalled();
});
it("rechecks screen state when stop races a viewer heartbeat", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  vi.mocked(f.controls.touchViewer).mockImplementation(async () => {
    await f.provider.stopScreen!(f.ref);
    throw new ComputerScreenError("SCREEN_CONTROL_REQUIRED");
  });
  const events = [];
  for await (const event of f.service.stream(scope, {
    viewerId: crypto.randomUUID(),
    recheck: async () => scope,
  }))
    events.push(event);
  expect(events).toMatchObject([
    { kind: "state", state: { running: true } },
    { kind: "state", state: { running: false } },
    { kind: "closed", reason: "SCREEN_STOPPED" },
  ]);
});
it("keeps genuine viewer expiry distinct from a stopped session", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  vi.mocked(f.controls.touchViewer).mockRejectedValue(
    new ComputerScreenError("SCREEN_CONTROL_REQUIRED"),
  );
  const events = [];
  for await (const event of f.service.stream(scope, {
    viewerId: crypto.randomUUID(),
    recheck: async () => scope,
  }))
    events.push(event);
  expect(events.at(-1)).toEqual({ kind: "closed", reason: "SCREEN_IDLE_TIMEOUT" });
  expect(
    events.some(
      (event) =>
        event.kind === "state" && event.state.status === "available" && !event.state.running,
    ),
  ).toBe(false);
});
it("emits authoritative stopped state when the provider ends before the next periodic check", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  f.provider.streamScreen = async function* () {
    yield await f.provider.screenshot!(f.ref);
    await f.provider.stopScreen!(f.ref);
  };
  const service = createComputerScreensService(f.computers, f.controls, f.provider, {
    recheckMs: 5_000,
  });
  const events = [];
  for await (const event of service.stream(scope, {
    viewerId: crypto.randomUUID(),
    recheck: async () => scope,
  }))
    events.push(event);
  expect(events.at(-2)).toMatchObject({
    kind: "state",
    state: { status: "available", running: false },
  });
  expect(events.at(-1)).toEqual({ kind: "closed", reason: "SCREEN_STOPPED" });
});
it("cleans up a viewer when an adapter fails before constructing its stream", async () => {
  const f = fixture();
  await f.provider.provision(f.ref);
  await f.service.start(scope);
  const viewerId = crypto.randomUUID();
  f.provider.streamScreen = () => {
    throw new Error("adapter unavailable");
  };
  const events = [];
  for await (const event of f.service.stream(scope, { viewerId, recheck: async () => scope }))
    events.push(event);
  expect(events).toEqual([{ kind: "closed", reason: "SCREEN_UNAVAILABLE" }]);
  expect(f.controls.openViewer).toHaveBeenCalledWith(scope, f.ref, viewerId);
  expect(f.controls.releaseViewer).toHaveBeenCalledWith(scope, f.ref, viewerId);
});
