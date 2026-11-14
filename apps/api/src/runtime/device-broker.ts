import { RedisRelayCluster } from "@raypx/control/relay";
import type { DeviceConnectorBroker } from "@raypx/computers/server";
/** Reuses the bounded private broker. Connections start only with the runtime. */
export function createDeviceBroker(url: string): DeviceConnectorBroker {
  const nodeId = crypto.randomUUID();
  let cluster: RedisRelayCluster | undefined;
  return {
    nodeId,
    ready: () => cluster?.ready() ?? false,
    async start(handler, unavailable) {
      cluster ??= new RedisRelayCluster(url, "raypx:device:", nodeId);
      await cluster.start(
        async (operation) => {
          if (operation.type !== "device-computer") throw new Error("Invalid connector operation");
          await handler(operation.deviceId, operation.frame);
          return { type: "device-computer" };
        },
        async () => {},
        unavailable,
      );
    },
    async invoke(owner, deviceId, frame, signal) {
      if (!cluster) throw new Error("Connector broker unavailable");
      const result = await cluster.invoke(
        owner,
        { type: "device-computer", deviceId, frame },
        signal,
      );
      if (result.type !== "device-computer") throw new Error("Invalid connector result");
    },
    close: async () => {
      await cluster?.close();
    },
  };
}
