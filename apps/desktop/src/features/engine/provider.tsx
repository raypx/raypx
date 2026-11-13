import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useDesktopPlatform } from "../../lib/platform-context.js";
import { createEngineController } from "./model.js";
import { useQueryClient } from "@tanstack/react-query";

type Controller = ReturnType<typeof createEngineController>;
const EngineContext = createContext<Controller | null>(null);
export function DesktopRuntimeProvider({ children }: { children: ReactNode }) {
  const platform = useDesktopPlatform();
  const controller = useMemo(() => createEngineController(platform), [platform]);
  const queries = useQueryClient();
  useEffect(
    () => (platform.isDesktop() ? controller.connect() : undefined),
    [platform, controller],
  );
  useEffect(() => {
    if (!platform.isDesktop()) return;
    return platform.onLocalEvent((event) => {
      if (event.event === "engine.status" && event.data.status === "ready")
        void queries.invalidateQueries({ queryKey: ["instance"] });
    });
  }, [platform, queries]);
  return <EngineContext.Provider value={controller}>{children}</EngineContext.Provider>;
}
export function useDesktopEngine() {
  const controller = useContext(EngineContext);
  if (!controller) throw new Error("DesktopRuntimeProvider is required");
  return {
    ...useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getServerSnapshot,
    ),
    refresh: controller.refresh,
    restart: controller.restart,
  };
}
