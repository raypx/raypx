import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deviceConnectorPayloadIdentity,
  type DeviceConnectorClientFrame,
  type DeviceConnectorRequest,
} from "@raypx/contracts/device-connector";
import { ConnectorStorage } from "../../../../src/runtime/device-connector/storage.js";
import {
  DeviceFiles,
  captureDeviceDirectory,
} from "../../../../src/runtime/device-connector/files.js";
import { DeviceConnectorEngine } from "../../../../src/runtime/device-connector/engine.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-device-process-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "workspace");
  await mkdir(root);
  const storage = new ConnectorStorage({ dataDir: join(directory, "data") });
  const identity = captureDeviceDirectory(root);
  const grant = {
    id: "grant",
    deviceId: "device",
    spaceId: "space",
    directory: identity.directory,
    revision: 1,
  };
  storage.mutate((state) => {
    state.binding = {
      serverOrigin: "http://127.0.0.1:1234",
      accountId: "owner",
      deviceId: "device",
      deviceName: "Test",
    };
    state.credential = {
      protocolVersion: 1,
      accountId: "owner",
      deviceId: "device",
      deviceName: "Test",
      credential: "restricted-device-credential-" + "s".repeat(48),
      credentialRevision: 1,
    };
    state.grants = [{ grant, dev: identity.dev, ino: identity.ino }];
    state.connectionFence = 1;
  });
  const frames: DeviceConnectorClientFrame[] = [];
  const engine = new DeviceConnectorEngine(storage, (frame) => frames.push(frame));
  cleanup.push(() => engine.cancelAll());
  function request(
    argv: string[],
    budget = 64 * 1024,
    changes: Partial<DeviceConnectorRequest> = {},
  ): DeviceConnectorRequest {
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
        kind: "execute",
        executable: process.execPath,
        argv,
        cwd: ".",
        environment: {},
        outputBudget: budget,
        approved: true,
      },
      ...changes,
    };
    value.payloadHash = createHash("sha256")
      .update(deviceConnectorPayloadIdentity(value))
      .digest("hex");
    return value;
  }
  const events = () => frames.filter((frame) => frame.type === "event").map((frame) => frame.event);
  return { storage, engine, request, events, grant };
}
it.skipIf(process.platform === "win32")(
  "bounds combined stdout/stderr and keeps inherited provider environment out of commands",
  async () => {
    const { engine, request, events } = await fixture();
    const old = process.env.RAYPX_DEVICE_PRIVATE_TEST;
    process.env.RAYPX_DEVICE_PRIVATE_TEST = "must-not-reach-command";
    try {
      await engine.request(
        request(
          [
            "--eval",
            'process.stdout.write(String(process.env.RAYPX_DEVICE_PRIVATE_TEST)+"x".repeat(4000));process.stderr.write("y".repeat(4000))',
          ],
          512,
        ),
      );
      const output = events().flatMap((event) =>
        event.kind === "stdout" || event.kind === "stderr"
          ? [Buffer.from(event.bytes, "base64")]
          : [],
      );
      expect(output.reduce((sum, buffer) => sum + buffer.length, 0)).toBe(512);
      expect(Buffer.concat(output).toString()).not.toContain("must-not-reach-command");
      expect(events().at(-1)).toMatchObject({
        kind: "exit",
        status: 0,
        cancelled: false,
        truncated: true,
      });
    } finally {
      if (old === undefined) delete process.env.RAYPX_DEVICE_PRIVATE_TEST;
      else process.env.RAYPX_DEVICE_PRIVATE_TEST = old;
    }
  },
);
it.skipIf(process.platform === "win32")(
  "redacts the restricted connector token even across output chunks",
  async () => {
    const { storage, engine, request, events } = await fixture();
    const token = storage.read().credential!.credential;
    await engine.request(
      request([
        "--eval",
        `process.stdout.write(${JSON.stringify(token.slice(0, 25))});setTimeout(()=>process.stdout.write(${JSON.stringify(token.slice(25))}),20)`,
      ]),
    );
    const output = events()
      .flatMap((event) =>
        event.kind === "stdout" || event.kind === "stderr"
          ? [Buffer.from(event.bytes, "base64").toString()]
          : [],
      )
      .join("");
    expect(output).not.toContain(token);
    expect(output).toBe("*".repeat(token.length));
  },
);
it.skipIf(process.platform === "win32")(
  "cancels a streaming command and records one known cancelled exit",
  async () => {
    const { engine, request, events } = await fixture();
    const call = request([
      "--eval",
      'process.stdout.write("started");setInterval(()=>process.stdout.write("."),5)',
    ]);
    const running = engine.request(call);
    await expect.poll(() => events().some((event) => event.kind === "stdout")).toBe(true);
    await engine.cancel(call.operationId);
    await running;
    expect(events().filter((event) => event.kind === "exit")).toEqual([
      expect.objectContaining({ cancelled: true }),
    ]);
  },
);
it.skipIf(process.platform === "win32")(
  "a reconnect changing the connection fence cancels owned work and refuses an old-fence command",
  async () => {
    const { storage, engine, request, events, grant } = await fixture();
    const call = request(["--eval", 'setInterval(()=>process.stdout.write("."),5)']);
    const running = engine.request(call);
    await expect.poll(() => events().some((event) => event.kind === "stdout")).toBe(true);
    await engine.reconnect(2, 0, [grant]);
    await running;
    expect(storage.read().connectionFence).toBe(2);
    expect(events().filter((event) => event.kind === "exit")).toEqual([
      expect.objectContaining({ cancelled: true }),
    ]);
    await engine.request(request(["--eval", 'process.stdout.write("should not run")']));
    expect(events().at(-1)).toEqual({ kind: "error", code: "STALE_FENCE" });
  },
);
it.skipIf(process.platform === "win32")(
  "revoking a grant cancels its active command and refuses further operations",
  async () => {
    const { engine, request, events } = await fixture();
    const call = request(["--eval", 'setInterval(()=>process.stdout.write("."),5)']);
    const running = engine.request(call);
    await expect.poll(() => events().some((event) => event.kind === "stdout")).toBe(true);
    await engine.updateGrants([]);
    await running;
    expect(events().filter((event) => event.kind === "exit")).toEqual([
      expect.objectContaining({ cancelled: true }),
    ]);
    await engine.request(request(["--eval", 'process.stdout.write("should not run")']));
    expect(events().at(-1)).toEqual({ kind: "error", code: "GRANT_REVOKED" });
  },
);

it.skipIf(process.platform === "win32")(
  "reports an executable startup failure without signalling a nonexistent process group",
  async () => {
    const { engine, request, events } = await fixture();
    await engine.request(
      request([], 1024, {
        operation: {
          kind: "execute",
          executable: "/missing-raypx-device-executable",
          argv: [],
          cwd: ".",
          environment: {},
          outputBudget: 1024,
          approved: true,
        },
      }),
    );
    expect(events().at(-1)).toEqual({ kind: "error", code: "UNAVAILABLE" });
  },
);

it.skipIf(process.platform === "win32")(
  "a cancellation or disconnect during cwd validation prevents the later process from starting",
  async () => {
    const { engine, request, events, storage } = await fixture();
    for (const cancel of ["operation", "disconnect"]) {
      let begin!: () => void;
      let release!: () => void;
      const began = new Promise<void>((resolve) => {
        begin = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const files = new DeviceFiles(storage.profile);
      const original = files.cwd.bind(files);
      const cwd = vi.spyOn(DeviceFiles.prototype, "cwd").mockImplementation(async (...args) => {
        begin();
        await gate;
        return original(...args);
      });
      const call = request(["--eval", 'process.stdout.write("must not start")']);
      try {
        const running = engine.request(call);
        await began;
        if (cancel === "operation") await engine.cancel(call.operationId);
        else await engine.cancelAll();
        release();
        await running;
        expect(events().at(-1)).toEqual({ kind: "error", code: "CANCELLED" });
        expect(
          events().filter((event) => event.kind === "stdout" || event.kind === "stderr"),
        ).toEqual([]);
      } finally {
        release();
        cwd.mockRestore();
      }
    }
  },
);
