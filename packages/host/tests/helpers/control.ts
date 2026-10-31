import { afterEach, expect, vi } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteControl } from "@raypx/host";
import {
  RELAY_VERSION,
  relayClientSchema,
  type RelayClientFrame,
  type RelayServerFrame,
  type SequencedEvent,
  type SnapshotRecord,
} from "@raypx/contracts/tasks";

export function hostFixtures() {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  async function control(
    options: NonNullable<ConstructorParameters<typeof RemoteControl>[4]> = {},
    rejectAuthentication = () => false,
    supportedVersion?: () => number,
  ) {
    const directory = mkdtempSync(join(tmpdir(), "raypx-relay-native-"));
    const streamId = crypto.randomUUID(),
      instanceId = crypto.randomUUID();
    const frames: RelayClientFrame[] = [],
      urls: string[] = [],
      journal: SequencedEvent[] = [],
      records: SnapshotRecord[] = [];
    let cursor = 0,
      initialized = false,
      floor = 0;
    const sockets = new Set<ReturnType<typeof sendSocket>>();
    function sendSocket(
      send: (value: string) => unknown,
      close: (code?: number, reason?: string) => unknown,
    ) {
      return { send: (frame: RelayServerFrame) => send(JSON.stringify(frame)), close };
    }
    const server = Bun.serve<{ peer: ReturnType<typeof sendSocket> }>({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request, listener) {
        urls.push(request.url);
        const data = { peer: undefined as unknown as ReturnType<typeof sendSocket> };
        if (listener.upgrade(request, { data })) return;
        return new Response(null, { status: 426 });
      },
      websocket: {
        open(socket) {
          socket.data.peer = sendSocket(
            (value) => socket.send(value),
            (code, reason) => socket.close(code, reason),
          );
          sockets.add(socket.data.peer);
        },
        message(socket, value) {
          const frame = relayClientSchema.parse(JSON.parse(String(value)));
          frames.push(frame);
          const peer = socket.data.peer;
          if (frame.type === "auth" && rejectAuthentication()) {
            peer.close(4001, "Rejected grant");
            return;
          }
          if (frame.type === "auth") {
            if (supportedVersion && frame.protocolVersion !== supportedVersion()) {
              peer.close(4006, "UPGRADE_REQUIRED");
              return;
            }
            peer.send({
              type: "ready",
              protocolVersion: RELAY_VERSION,
              role: frame.role,
            });
          }
          if (frame.type === "announce") {
            peer.send({ type: "resume", streamId, sequence: cursor, snapshot: !initialized });
          }
          if (frame.type === "snapshot" && frame.done) {
            cursor = frame.sequence;
            initialized = true;
            peer.send({ type: "ack", streamId, sequence: cursor, snapshotId: frame.id });
          }
          if (frame.type === "events") {
            cursor = frame.events.at(-1)!.sequence;
            peer.send({ type: "ack", streamId, sequence: cursor });
          }
          if (frame.type === "ping") peer.send({ type: "pong" });
        },
        close(socket) {
          sockets.delete(socket.data.peer);
        },
      },
    });
    const request = vi.fn(
      async (method: string, params: Record<string, unknown>): Promise<unknown> => {
        if (method === "agents.events")
          return { instanceId, events: journal.map((item) => item.event) };
        if (method === "agents.projects" || method === "agents.capabilities") return [];
        if (method === "agents.replay")
          return {
            streamId,
            sequence: journal.at(-1)?.sequence ?? 0,
            floor: floor || journal[0]?.sequence || 0,
            events: journal.filter((item) => item.sequence > Number(params.after)).slice(0, 50),
          };
        if (method === "agents.snapshot")
          return {
            id: params.id ?? crypto.randomUUID(),
            streamId,
            sequence: journal.at(-1)?.sequence ?? 0,
            records,
            next: records.length,
            done: true,
          };
        return { accepted: true };
      },
    );
    const notify = vi.fn(),
      renew = vi.fn(),
      value = new RemoteControl(directory, { request }, notify, renew, options);
    const grant = {
      deviceId: crypto.randomUUID(),
      epoch: 1,
      token: "private-device-grant-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
    cleanups.push(async () => {
      await value.detach();
      await server.stop(true);
      rmSync(directory, { recursive: true, force: true });
    });
    await value.enable("account", true);
    await value.attach("account", server.url.origin, grant);
    if (supportedVersion && supportedVersion() !== RELAY_VERSION)
      await expect.poll(() => value.info("account").error).toBe("UPGRADE_REQUIRED");
    else await expect.poll(() => value.info("account").connected).toBe(true);
    return {
      value,
      directory,
      frames,
      urls,
      journal,
      records,
      grant,
      request,
      notify,
      renew,
      sockets,
      base: server.url.origin,
      setFloor: (sequence: number) => {
        floor = sequence;
      },
    };
  }
  return { control };
}
