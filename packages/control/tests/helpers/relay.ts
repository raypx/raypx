import { vi } from "vitest";
import type { RelayServerFrame } from "@raypx/contracts/tasks";
import { ControlService } from "../../src/service.js";
import { RelayHub } from "../../src/relay/hub.js";
import type { RelayCluster } from "../../src/relay/cluster.js";
import { connected, memoryControlRepository, running } from "./control.js";

function clusterPeers() {
  const nodes = new Map<string, Parameters<RelayCluster["start"]>>();
  return (nodeId: string): RelayCluster => ({
    nodeId,
    ready: () => nodes.has(nodeId),
    async start(...handlers) {
      nodes.set(nodeId, handlers);
    },
    async invoke(target, operation, signal) {
      const handlers = nodes.get(target);
      if (!handlers) throw new Error("Missing relay node");
      return handlers[0](operation, signal);
    },
    async notify(notice) {
      await Promise.all(
        [...nodes].filter(([id]) => id !== nodeId).map(([, handlers]) => handlers[1](notice)),
      );
    },
    async close() {
      nodes.delete(nodeId);
    },
  });
}

function peer(hub: RelayHub) {
  const id = crypto.randomUUID(),
    frames: RelayServerFrame[] = [],
    close = vi.fn(() => {
      void hub.close(id);
    });
  hub.open({ id, send: (frame) => frames.push(frame), close });
  return { id, frames, close, receive: (frame: object) => hub.receive(id, JSON.stringify(frame)) };
}

export async function relayFixture(clustered = false) {
  const repository = memoryControlRepository(),
    control = new ControlService(repository),
    f = await connected(control),
    task = await running(control, f),
    host = await control.credentials.authorizeHost(f.auth, f.grant),
    grant = (await control.credentials.hostGrant(host.credential)).grant,
    deviceHub = new RelayHub(async (run) => run(control)),
    viewerHub = clustered ? new RelayHub(async (run) => run(control)) : deviceHub;
  let publish: RelayCluster["notify"] = async () => {
    throw new Error("Fixture needs clustered relays");
  };
  if (clustered) {
    const cluster = clusterPeers(),
      deviceCluster = cluster("device");
    publish = (notice) => deviceCluster.notify(notice);
    await deviceHub.attachCluster(deviceCluster);
    await viewerHub.attachCluster(cluster("viewer"));
  }
  const device = peer(deviceHub);
  await device.receive({ type: "auth", protocolVersion: 4, role: "device", token: grant.token });
  await device.receive(f.announce);
  await device.receive({ type: "available" });
  return {
    ...f,
    repository,
    control,
    task,
    device,
    viewerHub,
    publish,
    async viewer(sessionId = crypto.randomUUID()) {
      const auth = { ...f.auth, session: { ...f.auth.session, id: sessionId } },
        ticket = await control.credentials.ticket(auth),
        viewer = peer(viewerHub);
      await viewer.receive({
        type: "auth",
        protocolVersion: 4,
        role: "viewer",
        token: ticket.token,
      });
      viewer.frames.length = 0;
      return { ...viewer, sessionId };
    },
    close: async () => {
      await viewerHub.shutdown();
      if (deviceHub !== viewerHub) await deviceHub.shutdown();
    },
  };
}
