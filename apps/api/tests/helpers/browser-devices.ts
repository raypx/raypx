import { scrubProtectedValue } from "@raypx/core/protected-input";
import { z } from "zod";
import type { DeviceConnectorRegistry, DeviceComputersRepository } from "@raypx/computers/server";
import {
  deviceConnectorServerFrameSchema,
  type DeviceConnectorCredential,
  type DeviceConnectorEventData,
  type DeviceConnectorServerFrame,
} from "@raypx/contracts/device-connector";

const deviceName = "Browser fixture device";
const directory = "/fixture/device-workspace";
const pairInput = z.strictObject({ code: z.string().min(6).max(64) });
const statusInput = z.strictObject({ deviceId: z.uuid() });

interface FakeDevice {
  peerId: string;
  ownerAccountId: string;
  credential: DeviceConnectorCredential;
  connected: boolean;
  executionCount: number;
  fence: number;
  sequence: number;
  queue: Promise<void>;
}

/** Test-only native-confirmation hook and non-executing connector for the owned browser gate. */
export function browserDeviceFixture(
  repository: DeviceComputersRepository,
  registry: DeviceConnectorRegistry,
) {
  const devices = new Map<string, FakeDevice>();

  async function event(device: FakeDevice, operationId: string, value: DeviceConnectorEventData) {
    device.sequence += 1;
    await registry.receive(
      device.peerId,
      JSON.stringify({
        type: "event",
        connectionFence: device.fence,
        sequence: device.sequence,
        operationId,
        event: value,
      }),
    );
  }

  async function pair(code: string, accountId: string) {
    const claim = await repository.claim({ code, deviceName, platform: "unknown" });
    if (claim.accountId !== accountId) throw new Error("FIXTURE_ACCOUNT_MISMATCH");
    const credential = await repository.confirm({
      claimId: claim.claimId,
      claimToken: claim.claimToken,
    });
    const device: FakeDevice = {
      peerId: crypto.randomUUID(),
      ownerAccountId: accountId,
      credential,
      connected: false,
      executionCount: 0,
      fence: 0,
      sequence: 0,
      queue: Promise.resolve(),
    };
    let ready!: () => void;
    let failed!: (error: Error) => void;
    const initialized = new Promise<void>((resolve, reject) => {
      ready = resolve;
      failed = reject;
    });
    // Attach the rejection handler before a synchronous refusal can close the peer.
    void initialized.catch(() => {});
    async function frame(raw: DeviceConnectorServerFrame) {
      const value = deviceConnectorServerFrameSchema.parse(raw);
      if (value.type === "welcome") {
        device.credential = value.credential;
        device.fence = value.connectionFence;
        device.sequence = value.cursor;
        await registry.receive(
          device.peerId,
          JSON.stringify({
            type: "ready",
            connectionFence: value.connectionFence,
            credentialRevision: value.credential.credentialRevision,
          }),
        );
        device.connected = true;
        ready();
        return;
      }
      if (value.type === "ping") {
        await registry.receive(device.peerId, JSON.stringify({ type: "pong" }));
        return;
      }
      if (value.type === "request-grant") {
        // This explicit fixture hook replaces the native dialog only in browser tests.
        const identity = await repository.authenticate(device.credential.credential);
        await repository.grant(identity, { spaceId: value.spaceId, directory });
        await registry.refresh(identity);
        return;
      }
      if (value.type === "request") {
        const { operation, operationId } = value.request;
        await event(device, operationId, { kind: "accepted" });
        if (
          operation.kind !== "execute" ||
          operation.executable !== "echo" ||
          operation.argv.join(" ") !== "Fixture device command"
        ) {
          await event(device, operationId, { kind: "error", code: "INVALID_INPUT" });
          return;
        }
        device.executionCount += 1;
        await event(device, operationId, {
          kind: "stdout",
          bytes: Buffer.from(
            operation.protectedInput
              ? scrubProtectedValue(
                  `Delivered once: ${Buffer.from(operation.protectedInput.value).toString("base64")}`,
                  operation.protectedInput.value,
                )
              : "Fixture device command\n",
          ).toString("base64"),
        });
        await event(device, operationId, {
          kind: "exit",
          status: 0,
          cancelled: false,
          truncated: false,
        });
        return;
      }
      if (value.type === "cancel") {
        await event(device, value.operationId, { kind: "error", code: "CANCELLED" });
      }
    }
    devices.set(credential.deviceId, device);
    await registry.open(device.peerId, credential.credential, {
      send(value) {
        device.queue = device.queue
          .then(() => frame(value))
          .catch(() => {
            device.connected = false;
            failed(new Error("FIXTURE_CONNECTOR_FAILED"));
            void registry.close(device.peerId);
          });
      },
      close() {
        device.connected = false;
        failed(new Error("FIXTURE_CONNECTOR_CLOSED"));
        void registry.close(device.peerId);
      },
    });
    await registry.receive(
      device.peerId,
      JSON.stringify({
        type: "hello",
        protocolVersion: 2,
        deviceId: credential.deviceId,
        cursor: 0,
      }),
    );
    const timer = setTimeout(() => failed(new Error("FIXTURE_CONNECTOR_TIMEOUT")), 5_000);
    try {
      await initialized;
    } finally {
      clearTimeout(timer);
    }
    return { deviceId: credential.deviceId };
  }

  return {
    async handle(request: Request, accountId: string): Promise<Response> {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const body = await request.text();
      if (Buffer.byteLength(body) > 8192) return new Response(null, { status: 413 });
      try {
        const input: unknown = JSON.parse(body);
        if (new URL(request.url).pathname === "/fixture/device/pair") {
          return Response.json(await pair(pairInput.parse(input).code, accountId));
        }
        const { deviceId } = statusInput.parse(input);
        const device = devices.get(deviceId);
        if (!device || device.ownerAccountId !== accountId)
          return new Response(null, { status: 404 });
        return Response.json({
          connected: device.connected,
          executionCount: device.executionCount,
        });
      } catch {
        return new Response(null, { status: 400 });
      }
    },
    async close() {
      for (const device of devices.values()) {
        device.connected = false;
        await registry.close(device.peerId);
        await device.queue;
      }
      devices.clear();
    },
  };
}
