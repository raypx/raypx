import {
  deviceConnectorServerFrameSchema,
  DEVICE_CONNECTOR_MAX_FRAME_BYTES,
  DEVICE_CONNECTOR_PATHS,
  DEVICE_CONNECTOR_VERSION,
  type DeviceConnectorClientFrame,
  type DeviceConnectorServerFrame,
} from "@raypx/contracts/device-connector";
import { acquireLock } from "../state/index.js";
import { LocalError } from "../errors.js";
import { onShutdown } from "../../transport/shutdown.js";
import { ConnectorStorage, type ConnectorProfileOptions } from "./storage.js";
import { DeviceConnectorEngine } from "./engine.js";

export async function runDeviceConnector(
  options: ConnectorProfileOptions,
  outerSignal?: AbortSignal,
) {
  const storage = new ConnectorStorage(options);
  if (!storage.read().credential)
    throw new LocalError("CONNECTOR_NOT_PAIRED", "Pair this device first");
  const release = acquireLock(storage.directory, "connector-owner");
  if (!release) throw new LocalError("CONNECTOR_RUNNING", "Device connector is already running");
  const controller = new AbortController();
  const signal = outerSignal
    ? AbortSignal.any([outerSignal, controller.signal])
    : controller.signal;
  const removeSignals = onShutdown(() => controller.abort());
  const id = crypto.randomUUID();
  let socket: WebSocket | undefined;
  const send = (frame: DeviceConnectorClientFrame) => {
    const current = socket;
    if (!current || current.readyState !== WebSocket.OPEN) return;
    const encoded = JSON.stringify(frame);
    const size = Buffer.byteLength(encoded);
    if (
      size > DEVICE_CONNECTOR_MAX_FRAME_BYTES ||
      current.bufferedAmount + size > DEVICE_CONNECTOR_MAX_FRAME_BYTES * 2
    ) {
      current.close();
      return;
    }
    try {
      current.send(encoded);
    } catch {
      current.close();
    }
  };
  const engine = new DeviceConnectorEngine(storage, send);
  const heartbeat = setInterval(() => {
    try {
      storage.mutate((state) => {
        if (state.daemon?.id !== id || state.daemon.stopRequested || !state.credential)
          controller.abort();
        else state.daemon.heartbeatAt = Date.now();
      });
    } catch {
      controller.abort();
    }
  }, 1000);
  storage.mutate((state) => {
    state.daemon = { id, pid: process.pid, heartbeatAt: Date.now(), stopRequested: false };
  });
  let delay = 250;
  try {
    while (!signal.aborted) {
      const state = storage.read();
      if (!state.binding || !state.credential) break;
      const url = new URL(DEVICE_CONNECTOR_PATHS.connect, state.binding.serverOrigin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      await new Promise<void>((resolve) => {
        let settled = false;
        let processing = Promise.resolve();
        let ready = false;
        const current = new WebSocket(url.href, {
          headers: { Authorization: `Bearer ${state.credential!.credential}` },
        });
        socket = current;
        const timeout = setTimeout(() => {
          if (!ready) current.close();
        }, 10_000);
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
          void engine.cancelAll().finally(resolve);
        };
        const abort = () => {
          current.close();
          finish();
        };
        signal.addEventListener("abort", abort, { once: true });
        current.addEventListener(
          "open",
          () =>
            send({
              type: "hello",
              protocolVersion: DEVICE_CONNECTOR_VERSION,
              deviceId: state.binding!.deviceId,
              cursor: state.acknowledged,
            }),
          { once: true },
        );
        const handle = async (frame: DeviceConnectorServerFrame) => {
          if (settled || signal.aborted) return;
          if (frame.type === "welcome") {
            if (
              ready ||
              frame.credential.deviceId !== state.binding!.deviceId ||
              frame.credential.accountId !== state.binding!.accountId
            )
              throw new Error();
            await engine.reconnect(frame.connectionFence, frame.cursor, frame.grants);
            storage.mutate((stored) => {
              if (!stored.credential || stored.daemon?.id !== id || stored.daemon.stopRequested)
                throw new LocalError("CONNECTOR_REVOKED", "Device connector is stopping");
              stored.credential = frame.credential;
            });
            send({
              type: "ready",
              connectionFence: frame.connectionFence,
              credentialRevision: frame.credential.credentialRevision,
            });
            ready = true;
            delay = 250;
            for (const pending of storage.read().outbox) send(pending);
            return;
          }
          if (frame.type === "ping") {
            send({ type: "pong" });
            return;
          }
          if (frame.type === "revoked") {
            storage.mutate((stored) => {
              stored.credential = null;
              stored.grants = [];
            });
            controller.abort();
            return;
          }
          if (!ready) throw new Error();
          if (frame.type === "request-grant") {
            storage.mutate((stored) => {
              stored.grantRequests = stored.grantRequests.filter(
                (request) => request.expiresAt > Date.now(),
              );
              if (stored.grantRequests.some((request) => request.requestId === frame.requestId))
                return;
              if (stored.grantRequests.length >= 16) return;
              stored.grantRequests.push({
                requestId: frame.requestId,
                spaceId: frame.spaceId,
                spaceLabel: frame.spaceLabel,
                expiresAt: Date.now() + 60_000,
              });
            });
            return;
          }
          const fence = storage.read().connectionFence;
          if (frame.type === "request") {
            if (frame.request.connectionFence !== fence) return;
            // Work may stream for a full minute; later cancel/ACK frames remain dispatchable.
            void engine.request(frame.request).catch(() => current.close());
            return;
          }
          if (frame.connectionFence !== fence) throw new Error();
          if (frame.type === "ack") {
            engine.acknowledge(frame.sequence);
            return;
          }
          if (frame.type === "cancel") {
            await engine.cancel(frame.operationId);
            return;
          }
          await engine.updateGrants(frame.grants);
        };
        current.addEventListener("message", (message) => {
          if (
            typeof message.data !== "string" ||
            Buffer.byteLength(message.data) > DEVICE_CONNECTOR_MAX_FRAME_BYTES
          ) {
            current.close();
            return;
          }
          let frame: DeviceConnectorServerFrame;
          try {
            frame = deviceConnectorServerFrameSchema.parse(JSON.parse(message.data));
          } catch {
            current.close();
            return;
          }
          processing = processing.then(() => handle(frame)).catch(() => current.close());
        });
        current.addEventListener("close", finish, { once: true });
        current.addEventListener("error", () => current.close(), { once: true });
      });
      socket = undefined;
      if (!signal.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, delay);
          function done() {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          }
          signal.addEventListener("abort", done, { once: true });
        });
        delay = Math.min(30_000, delay * 2);
      }
    }
  } finally {
    controller.abort();
    socket?.close();
    await engine.cancelAll();
    clearInterval(heartbeat);
    removeSignals();
    storage.mutate((state) => {
      if (state.daemon?.id === id) state.daemon = null;
    });
    release();
  }
}
