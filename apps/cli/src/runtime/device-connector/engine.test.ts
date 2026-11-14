import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deviceConnectorPayloadIdentity,
  type DeviceConnectorClientFrame,
  type DeviceConnectorRequest,
} from "@raypx/contracts/device-connector";
import { captureDeviceDirectory } from "./files.js";
import { DeviceConnectorEngine } from "./engine.js";
import { ConnectorStorage } from "./storage.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-device-engine-"));
  directories.push(directory);
  const root = join(directory, "workspace");
  await mkdir(root);
  const storage = new ConnectorStorage({ dataDir: join(directory, "data") });
  const grant = {
    id: "grant",
    deviceId: "device",
    spaceId: "space",
    directory: captureDeviceDirectory(root).directory,
    revision: 1,
  };
  storage.mutate((state) => {
    state.binding = {
      serverOrigin: "http://127.0.0.1:1234",
      accountId: "owner",
      deviceId: "device",
      deviceName: "Test device",
    };
    state.credential = {
      protocolVersion: 1,
      accountId: "owner",
      deviceId: "device",
      deviceName: "Test device",
      credential: "t".repeat(64),
      credentialRevision: 1,
    };
    const identity = captureDeviceDirectory(root);
    state.grants = [{ grant, dev: identity.dev, ino: identity.ino }];
    state.connectionFence = 1;
  });
  const frames: DeviceConnectorClientFrame[] = [];
  const engine = new DeviceConnectorEngine(storage, (frame) => frames.push(frame));
  const request = (changes: Partial<DeviceConnectorRequest> = {}): DeviceConnectorRequest => {
    const value: DeviceConnectorRequest = {
      operationId: crypto.randomUUID(),
      payloadHash: "0".repeat(64),
      deviceId: "device",
      accountId: "owner",
      requesterAccountId: "owner",
      spaceId: "space",
      grantId: "grant",
      grantRevision: 1,
      connectionFence: 1,
      runId: "run",
      runFence: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      operation: {
        kind: "write",
        path: "file.txt",
        bytes: Buffer.from("first").toString("base64"),
      },
      ...changes,
    };
    value.payloadHash = createHash("sha256")
      .update(deviceConnectorPayloadIdentity(value))
      .digest("hex");
    return value;
  };
  const lastEvent = () => {
    const frame = frames.at(-1);
    if (frame?.type !== "event") throw new Error();
    return frame.event;
  };
  return { directory, root, storage, grant, engine, frames, request, lastEvent };
}
describe("device operation admission and durable receipts", () => {
  it.skipIf(process.platform === "win32")(
    "journals acceptance before a write and reuses a known result without writing twice",
    async () => {
      const { root, storage, engine, frames, request } = await fixture();
      const operation = request();
      await engine.request(operation);
      expect(frames.map((frame) => frame.type === "event" && frame.event.kind)).toEqual([
        "accepted",
        "result",
      ]);
      expect(storage.read().receipts[operation.operationId]?.state).toBe("done");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(root, "file.txt"), "changed externally");
      await engine.request(operation);
      expect(await readFile(join(root, "file.txt"), "utf8")).toBe("changed externally");
      expect(frames).toHaveLength(3);
    },
  );
  it.each([
    { requesterAccountId: "other" },
    { accountId: "other" },
    { deviceId: "other" },
    { spaceId: "other" },
    { grantRevision: 2 },
    { connectionFence: 2 },
    { expiresAt: new Date(0).toISOString() },
  ])("refuses mismatched admission %j without accepting work", async (change) => {
    const { root, storage, engine, request, lastEvent } = await fixture();
    const operation = request(change);
    await engine.request(operation);
    expect(lastEvent().kind).toBe("error");
    expect(storage.read().receipts[operation.operationId]).toBeUndefined();
    await expect(readFile(join(root, "file.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects changed payload/hash without replacing its known receipt", async () => {
    const { engine, storage, request, lastEvent } = await fixture();
    const operation = request();
    await engine.request(operation);
    const previous = storage.read().receipts[operation.operationId];
    await engine.request(
      request({
        operationId: operation.operationId,
        operation: { kind: "write", path: "other.txt", bytes: "eA==" },
      }),
    );
    expect(lastEvent()).toEqual({ kind: "error", code: "COMMAND_CONFLICT" });
    expect(storage.read().receipts[operation.operationId]).toEqual(previous);
  });
  it("refuses unknown accepted operations after reconnect and never replays them", async () => {
    const { engine, storage, grant, request, lastEvent } = await fixture();
    const operation = request();
    storage.mutate((state) => {
      state.receipts[operation.operationId] = {
        hash: operation.payloadHash,
        runFence: 1,
        state: "accepted",
        terminal: null,
      };
    });
    await engine.reconnect(2, 0, [grant]);
    await engine.request({ ...operation, connectionFence: 2, runFence: 2 });
    expect(lastEvent()).toEqual({ kind: "error", code: "OUTCOME_UNKNOWN" });
    expect(storage.read().receipts[operation.operationId]?.state).toBe("unknown");
  });
  it("fences older Run attempts across different operation ids", async () => {
    const { engine, request, lastEvent } = await fixture();
    await engine.request(request({ runFence: 2 }));
    await engine.request(request({ runFence: 1 }));
    expect(lastEvent()).toEqual({ kind: "error", code: "STALE_FENCE" });
  });
  it("retains only locally confirmed grants and drops revoked grants on reconnect", async () => {
    const { engine, storage, grant, request, lastEvent } = await fixture();
    await engine.reconnect(2, 0, [{ ...grant, revision: 2 }]);
    expect(storage.read().grants).toEqual([]);
    await engine.request(request({ connectionFence: 2, grantRevision: 2 }));
    expect(lastEvent()).toEqual({ kind: "error", code: "GRANT_REVOKED" });
  });
  it("acknowledges only sent sequence and keeps cursor monotonic", async () => {
    const { engine, storage, request } = await fixture();
    await engine.request(request());
    expect(storage.read().outbox).toHaveLength(2);
    engine.acknowledge(2);
    expect(storage.read().outbox).toEqual([]);
    expect(() => engine.acknowledge(3)).toThrow("Invalid connector acknowledgement");
    expect(() => engine.acknowledge(1)).toThrow("Invalid connector acknowledgement");
  });
  it("native confirmation is expiring and consumed exactly once", async () => {
    const { storage } = await fixture();
    const prepared = storage.pending("grant", { directory: "path" });
    expect(storage.consume(prepared.confirmationId, "grant")).toEqual({ directory: "path" });
    expect(() => storage.consume(prepared.confirmationId, "grant")).toThrow(
      "Native confirmation expired",
    );
    const expired = storage.pending("pair", {});
    storage.mutate((state) => {
      state.pending[0]!.expiresAt = new Date(0).toISOString();
    });
    expect(() => storage.consume(expired.confirmationId, "pair")).toThrow(
      "Native confirmation expired",
    );
  });
});
