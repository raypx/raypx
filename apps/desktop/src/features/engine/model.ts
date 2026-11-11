import type { DesktopRuntime } from "../../../bridge.js";
import type { DesktopPlatform } from "../../lib/platform.js";

export interface EngineSnapshot {
  engine: DesktopRuntime["engine"];
  refreshing: boolean;
  connected: boolean;
}
const initial: EngineSnapshot = {
  engine: { status: "starting" },
  refreshing: false,
  connected: false,
};
export function createEngineController(
  platform: Pick<DesktopPlatform, "getDesktopRuntime" | "onLocalEvent" | "restartEngine">,
) {
  let snapshot = initial;
  let generation = 0,
    eventVersion = 0,
    read = 0;
  const listeners = new Set<() => void>();
  const publish = (value: Omit<EngineSnapshot, "connected">) => {
    snapshot = { ...value, connected: snapshot.connected || value.engine.status === "ready" };
    for (const listener of listeners) listener();
  };
  async function refresh() {
    const owner = generation,
      revision = eventVersion,
      id = ++read;
    publish({ ...snapshot, refreshing: true });
    try {
      const runtime = await platform.getDesktopRuntime();
      if (owner === generation && id === read)
        publish({
          engine: revision === eventVersion ? runtime.engine : snapshot.engine,
          refreshing: false,
        });
    } catch {
      if (owner === generation && id === read)
        publish({
          engine: revision === eventVersion ? { status: "error" } : snapshot.engine,
          refreshing: false,
        });
    }
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect() {
      generation++;
      const stop = platform.onLocalEvent((event) => {
        if (event.event !== "engine.status") return;
        const status = event.data.status;
        if (status !== "starting" && status !== "ready" && status !== "error") return;
        eventVersion++;
        publish({
          engine: {
            status,
            ...(typeof event.data.code === "string" ? { code: event.data.code } : {}),
          },
          refreshing: snapshot.refreshing,
        });
      });
      void refresh();
      return () => {
        generation++;
        read++;
        stop();
      };
    },
    refresh,
    restart: async (replaceOwner = false) => {
      const owner = generation;
      await platform.restartEngine(replaceOwner);
      if (owner !== generation) return false;
      await refresh();
      return snapshot.engine.status === "ready";
    },
  };
}
