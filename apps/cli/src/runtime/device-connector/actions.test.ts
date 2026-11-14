import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnectorStorage } from "./storage.js";
import { acquireLock } from "../state/index.js";
import { nativeDeviceAction, revokeDeviceConnector, revokeDeviceGrant } from "./actions.js";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-device-native-"));
  directories.push(directory);
  const options = { dataDir: directory };
  const storage = new ConnectorStorage(options);
  storage.mutate((state) => {
    state.binding = {
      serverOrigin: "https://device.example.test",
      accountId: "owner",
      deviceId: "device",
      deviceName: "Test device",
    };
    state.credential = {
      protocolVersion: 2,
      accountId: "owner",
      deviceId: "device",
      deviceName: "Test device",
      credential: "secret".repeat(12),
      credentialRevision: 1,
    };
    state.grantRequests = [
      { requestId: "expired", spaceId: "space", spaceLabel: "Expired", expiresAt: Date.now() - 1 },
      {
        requestId: "request",
        spaceId: "space",
        spaceLabel: "Space",
        expiresAt: Date.now() + 60_000,
      },
    ];
  });
  return { options, storage };
}
it("a native grant-request claim is account/origin bound, expires, and consumes only one request", async () => {
  const { options, storage } = await fixture();
  for (const binding of [
    { serverOrigin: "https://other.example.test", accountId: "owner" },
    { serverOrigin: "https://device.example.test", accountId: "other" },
  ]) {
    expect(
      await nativeDeviceAction(options, { action: "grant_request_claim", ...binding }),
    ).toEqual({ request: null });
    expect(storage.read().grantRequests).toHaveLength(2);
  }
  const input = {
    action: "grant_request_claim",
    serverOrigin: "https://device.example.test",
    accountId: "owner",
  };
  expect(await nativeDeviceAction(options, input)).toEqual({
    request: { requestId: "request", spaceId: "space", spaceLabel: "Space", deviceId: "device" },
  });
  expect(await nativeDeviceAction(options, input)).toEqual({ request: null });
  expect(storage.read().grants).toEqual([]);
});
it("revocation prevents pending native requests from producing a prompt", async () => {
  const { options, storage } = await fixture();
  storage.mutate((state) => {
    state.credential = null;
  });
  expect(
    await nativeDeviceAction(options, {
      action: "grant_request_claim",
      serverOrigin: "https://device.example.test",
      accountId: "owner",
    }),
  ).toEqual({ request: null });
});

it.skipIf(process.platform === "win32")(
  "refuses a credential journal whose permissions were widened",
  async () => {
    const { storage } = await fixture();
    const { chmod } = await import("node:fs/promises");
    const file = join(storage.directory, "connector.json");
    await chmod(file, 0o644);
    try {
      expect(() => storage.read()).toThrow("Device connector storage is unavailable");
    } finally {
      await chmod(file, 0o600);
    }
  },
);

it("uses the final rotated credential when revoking a grant after the owner stops", async () => {
  const { storage } = await fixture();
  const release = acquireLock(storage.directory, "connector-owner");
  if (!release) throw new Error("Owned connector lock unavailable");
  storage.mutate((state) => {
    state.grants = [
      {
        grant: {
          id: "grant",
          deviceId: "device",
          spaceId: "space",
          directory: "/workspace",
          revision: 1,
        },
        dev: "1",
        ino: "2",
      },
    ];
  });
  const fetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  const revoking = revokeDeviceGrant(storage, "grant");
  storage.mutate((state) => {
    state.credential = {
      ...state.credential!,
      credentialRevision: 2,
      credential: "rotated".repeat(12),
    };
  });
  release();
  await expect(revoking).resolves.toEqual({ revoked: true });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]).toEqual([
    new URL("https://device.example.test/device/grants/revoke"),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer " + "rotated".repeat(12) }),
    }),
  ]);
});

it("erases local credentials and pending confirmations when the server cannot confirm revocation", async () => {
  const { storage } = await fixture();
  storage.pending("grant", {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Owned offline fixture");
    }),
  );
  await expect(revokeDeviceConnector(storage)).resolves.toEqual({
    revoked: true,
    serverRevoked: false,
  });
  expect(storage.read()).toMatchObject({
    credential: null,
    grants: [],
    pending: [],
    grantRequests: [],
  });
});
