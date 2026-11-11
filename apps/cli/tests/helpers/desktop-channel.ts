import { expect } from "vite-plus/test";
import type { DesktopChannel } from "@raypx/contracts/desktop";
import { daemonFetch, type DaemonEndpoint } from "../../src/runtime/daemon/endpoint.ts";
import { localFetch, type LocalAddress } from "../../src/runtime/local-http.ts";

export const pageOrigin = `mygo://${"a".repeat(32)}`;
type Packet = {
  type: string;
  id?: string;
  streamId?: string;
  sequence?: number;
  result?: unknown;
  error?: { code: string };
  event?: { event: string; data: Record<string, unknown> };
};

export function desktopGateway(endpoint: DaemonEndpoint, apiUrl = "https://api.example.test") {
  async function bootstrap(extra: Record<string, unknown> = {}) {
    const response = await daemonFetch(endpoint, "/desktop", {
      action: "bootstrap",
      ownerId: "d".repeat(64),
      protocol: 1,
      apiUrl,
      pageOrigin,
      key: Buffer.alloc(32, 4).toString("base64"),
      ...extra,
    });
    const envelope = (await response.json()) as {
      result: { channel: DesktopChannel; nativeCapability: string; nativeAddress: LocalAddress };
      error?: unknown;
    };
    expect(envelope.error).toBeUndefined();
    return envelope.result;
  }
  async function native(
    descriptor: Awaited<ReturnType<typeof bootstrap>>,
    action: Record<string, unknown>,
  ) {
    const response = await localFetch(descriptor.nativeAddress, "/desktop/native", {
      method: "POST",
      headers: {
        authorization: `Bearer ${descriptor.nativeCapability}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(action),
    });
    expect(response.ok).toBe(true);
    const envelope = (await response.json()) as { result: unknown; error?: { code: string } };
    if (envelope.error) throw Object.assign(new Error(envelope.error.code), envelope.error);
    return envelope.result;
  }
  return { bootstrap, native };
}

export async function connectDesktop(
  cleanups: (() => unknown)[],
  channel: DesktopChannel,
  options: { origin?: string; capability?: string; protocol?: number; ack?: boolean } = {},
) {
  const socket = new WebSocket(channel.url, { headers: { origin: options.origin ?? pageOrigin } });
  cleanups.push(() => {
    socket.close();
  });
  const packets: Packet[] = [];
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: unknown): void }
  >();
  let ready!: () => void;
  const opened = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let closed!: () => void;
  const ended = new Promise<void>((resolve) => {
    closed = resolve;
  });
  socket.addEventListener("close", () => {
    for (const operation of pending.values()) operation.reject(new Error("channel closed"));
    pending.clear();
    closed();
  });
  socket.addEventListener("error", () => {
    closed();
  });
  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "authenticate",
        protocol: options.protocol ?? 1,
        capability: options.capability ?? channel.capability,
      }),
    );
  });
  socket.addEventListener("message", ({ data }) => {
    const packet = JSON.parse(String(data)) as Packet;
    packets.push(packet);
    if (packet.type === "ready") ready();
    if (packet.type === "event" && options.ack !== false)
      socket.send(
        JSON.stringify({ type: "ack", streamId: packet.streamId, sequence: packet.sequence }),
      );
    if (packet.type === "response" && packet.id) {
      const operation = pending.get(packet.id);
      pending.delete(packet.id);
      if (packet.error)
        operation?.reject(Object.assign(new Error(packet.error.code), packet.error));
      else operation?.resolve(packet.result);
    }
  });
  function request(method: string, params: unknown) {
    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ type: "request", id, method, params }));
    });
  }
  return {
    socket,
    packets,
    ready: opened,
    ended,
    request,
    local: (method: string, params: unknown = {}) => request("local_request", { method, params }),
  };
}
