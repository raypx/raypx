import { vi } from "vitest";
import { DeviceComputersController, type DeviceComputersPort } from "@raypx/agents/model";
import type { ConversationId } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";

/** Real device projection with explicit loading, failure and unavailable selections. */
export async function deviceComputerFixture(
  spaceId: SpaceId,
  conversationId: ConversationId,
  state: "connected" | "offline" | "loading" | "error" = "connected",
) {
  const deviceId = "11111111-1111-4111-8111-111111111111";
  const grantId = "22222222-2222-4222-8222-222222222222";
  let selection: { deviceId: string; grantId: string } | null = { deviceId, grantId };
  const port: DeviceComputersPort = {
    list: vi.fn<DeviceComputersPort["list"]>(async () => {
      if (state === "error") throw new Error("Unavailable");
      if (state === "loading")
        return new Promise<Awaited<ReturnType<DeviceComputersPort["list"]>>>(() => {});
      return {
        devices: [
          {
            id: deviceId,
            name: "Work machine",
            platform: "darwin",
            connected: state === "connected",
            connectionState: state === "connected" ? "connected" : "offline",
            grants: [
              { id: grantId, spaceId, directory: "/work/project", revision: 1, revokedAt: null },
            ],
            createdAt: "2026-11-14T00:00:00.000Z",
          },
        ],
      };
    }),
    createPairing: vi.fn(),
    requestGrant: vi.fn(),
    revokeGrant: vi.fn(),
    revoke: vi.fn(),
    getSelection: vi.fn(async () => ({ selection })),
    select: vi.fn(async (input) => {
      selection = input.selection;
      return { selection };
    }),
  };
  const controller = new DeviceComputersController(spaceId, port, conversationId);
  if (state !== "loading") await controller.refresh();
  return { controller, port, deviceId, grantId };
}
