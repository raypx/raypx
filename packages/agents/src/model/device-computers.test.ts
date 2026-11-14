import { expect, it, vi } from "vitest";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import { DeviceComputersController, type DeviceComputersPort } from "./device-computers.js";
import { deferred } from "../../tests/support/computer-fixture.js";

const spaceId = spaceIdSchema.parse("space");
const conversationId = conversationIdSchema.parse("conversation");
function fixture() {
  let selection: { deviceId: string; grantId: string } | null = {
    deviceId: "device",
    grantId: "grant",
  };
  const port: DeviceComputersPort = {
    list: vi.fn(async () => ({ devices: [] })),
    createPairing: vi.fn(async () => ({
      code: "temporary-code",
      expiresAt: "2100-01-01T00:00:00Z",
    })),
    requestGrant: vi.fn(async () => ({ requestId: "request" })),
    revoke: vi.fn(async () => ({ ok: true as const })),
    revokeGrant: vi.fn(async () => ({ ok: true as const })),
    getSelection: vi.fn(async () => ({ selection })),
    select: vi.fn(async (input) => {
      selection = input.selection;
      return { selection };
    }),
  };
  return { port };
}

it("retains an unavailable selected device until an explicit selection, without starting work", async () => {
  const { port } = fixture();
  const controller = new DeviceComputersController(spaceId, port, conversationId);
  expect(port.list).not.toHaveBeenCalled();
  await controller.refresh();
  expect(controller.getSnapshot().selection).toEqual({ deviceId: "device", grantId: "grant" });
  expect(port.select).not.toHaveBeenCalled();
  await controller.select(null);
  expect(port.select).toHaveBeenCalledExactlyOnceWith({ spaceId, conversationId, selection: null });
  expect(controller.getSnapshot().selection).toBeNull();
  controller.dispose();
});

it("discards stale reads and never infers that a refused selection applied", async () => {
  const { port } = fixture();
  const controller = new DeviceComputersController(spaceId, port, conversationId);
  const pending = deferred<Awaited<ReturnType<DeviceComputersPort["getSelection"]>>>();
  vi.mocked(port.getSelection).mockReturnValueOnce(pending.promise);
  const oldRead = controller.refresh();
  await controller.select(null);
  pending.resolve({ selection: { deviceId: "stale", grantId: "stale" } });
  await oldRead;
  expect(controller.getSnapshot().selection).toBeNull();
  vi.mocked(port.select).mockRejectedValueOnce(new Error("private detail"));
  expect(await controller.select({ deviceId: "device", grantId: "grant" })).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ selection: null, error: true, busy: false });
  controller.dispose();
});

it("routes pairing through the host and directory requests through the server to the selected machine", async () => {
  const { port } = fixture();
  const native = { pair: vi.fn(async () => true), grant: vi.fn(async () => false) };
  const controller = new DeviceComputersController(spaceId, port, undefined, native);
  await controller.pair();
  expect(native.pair).toHaveBeenCalledExactlyOnceWith("temporary-code");
  expect(controller.getSnapshot().pairing).toBeNull();
  await controller.requestGrant("device");
  expect(native.grant).not.toHaveBeenCalled();
  expect(port.requestGrant).toHaveBeenCalledExactlyOnceWith({ spaceId, deviceId: "device" });
  expect(controller.getSnapshot().grantRequested).toBe(true);
  controller.dispose();
});

it("does not open a late native confirmation after the account or Space view was disposed", async () => {
  const { port } = fixture();
  const pending = deferred<{ code: string; expiresAt: string }>();
  vi.mocked(port.createPairing).mockReturnValueOnce(pending.promise);
  const native = { pair: vi.fn(async () => true), grant: vi.fn(async () => true) };
  const controller = new DeviceComputersController(spaceId, port, undefined, native);
  const pairing = controller.pair();
  controller.dispose();
  pending.resolve({ code: "late-secret", expiresAt: "2100-01-01T00:00:00Z" });
  await pairing;
  expect(native.pair).not.toHaveBeenCalled();
  expect(controller.getSnapshot().pairing).toBeNull();
});
