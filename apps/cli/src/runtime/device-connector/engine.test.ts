import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deviceConnectorPayloadIdentity,
  type DeviceConnectorClientFrame,
  type DeviceConnectorRequest,
  type DeviceMemberReadRequest,
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
      protocolVersion: 2,
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

it.each(["environment", "stdin"] as const)(
  "scrubs protected %s before the device journal and excludes the value from receipt hashes",
  async (kind) => {
    const { engine, storage, request, frames } = await fixture();
    const value = `one-use-${crypto.randomUUID()}-中文 /+?`;
    const executable = process.execPath;
    const script = `const v = process.env.TOKEN ?? await new Response(Bun.stdin.stream()).text(); const b = Buffer.from(v); for (const x of [v,b.toString("base64"),b.toString("base64url"),b.toString("hex"),encodeURIComponent(v)]) { process.stdout.write(x.slice(0,3)); await Bun.sleep(1); process.stdout.write(x.slice(3)+"\\n"); }`;
    const operation = request({
      operation: {
        kind: "execute",
        executable,
        argv: ["-e", script],
        cwd: ".",
        environment: {},
        outputBudget: 32768,
        approved: true,
        protectedInput: {
          destination: kind === "stdin" ? { kind } : { kind, variable: "TOKEN" },
          value,
        },
      },
    });
    expect(deviceConnectorPayloadIdentity(operation).includes(value)).toBe(false);
    await engine.request(operation);
    expect(frames.at(-1)).toMatchObject({ type: "event", event: { kind: "exit", status: 0 } });
    const decoded = frames
      .flatMap((frame) =>
        frame.type === "event" && (frame.event.kind === "stdout" || frame.event.kind === "stderr")
          ? [Buffer.from(frame.event.bytes, "base64").toString()]
          : [],
      )
      .join("");
    const journal = await readFile(join(storage.directory, "connector.json"), "utf8");
    for (const secret of [
      value,
      Buffer.from(value).toString("base64"),
      Buffer.from(value).toString("base64url"),
      Buffer.from(value).toString("hex"),
      encodeURIComponent(value),
    ]) {
      expect(
        [decoded, journal, JSON.stringify(storage.read())].every(
          (surface) => !surface.includes(secret),
        ),
      ).toBe(true);
    }
    const count = frames.length;
    await engine.request(operation);
    expect(frames.length).toBe(count + 1);
  },
);

it("serializes short competing connector-state writes without losing updates", async () => {
  const { directory, storage } = await fixture();
  const modulePath = new URL("./storage.ts", import.meta.url).href;
  const script = `const { ConnectorStorage } = await import(${JSON.stringify(modulePath)}); const storage = new ConnectorStorage({dataDir: ${JSON.stringify("REPLACE_DATA")}}); for(let i=0;i<20;i++) storage.mutate(state => { state.runFences.counter = (state.runFences.counter ?? 0) + 1; });`;
  const workers = Array.from({ length: 2 }, () =>
    Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        "-e",
        script.replace("REPLACE_DATA", join(directory, "data")),
      ],
      {
        stdout: "ignore",
        stderr: "ignore",
        env: { ...process.env, RAYPX_HOME: join(directory, "home") },
      },
    ),
  );
  expect(await Promise.all(workers.map((worker) => worker.exited))).toEqual([0, 0]);
  expect(storage.read().runFences.counter).toBe(40);
});

it.skipIf(process.platform === "win32")(
  "serves owner member reads without journal authority and refuses stale grants, owners and fences",
  async () => {
    const { root, storage, engine, frames } = await fixture();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(root, "member.txt"), "Member fixture");
    const request: DeviceMemberReadRequest = {
      id: crypto.randomUUID(),
      deviceId: "device",
      accountId: "owner",
      spaceId: "space",
      grantId: "grant",
      grantRevision: 1,
      connectionFence: 1,
      expiresAt: new Date(Date.now() + 10_000).toISOString(),
      operation: { kind: "read", path: "member.txt", maxBytes: 6 },
    };
    await engine.memberRead(request);
    expect(frames.at(-1)).toMatchObject({
      type: "member-read-result",
      id: request.id,
      result: { kind: "read", bytes: Buffer.from("Member").toString("base64"), truncated: true },
    });
    for (const change of [
      { accountId: "other" },
      { spaceId: "other" },
      { grantRevision: 2 },
      { connectionFence: 2 },
      { expiresAt: new Date(Date.now() - 1).toISOString() },
    ]) {
      await engine.memberRead({ ...request, ...change });
      expect(frames.at(-1)).toMatchObject({
        type: "member-read-result",
        result: { kind: "error", code: "ACCESS_DENIED" },
      });
    }
    expect(storage.read().outbox).toEqual([]);
    expect(storage.read().receipts).toEqual({});
  },
);
