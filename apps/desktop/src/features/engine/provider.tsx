import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useDesktopPlatform } from "../../lib/platform-context.tsx";
import { createEngineController } from "./model.ts";
import { useQueryClient } from "@tanstack/react-query";
import { taskChangeSchema } from "@raypx/contracts/tasks";
import { projectCatalogKey } from "../tasks/project-catalog.ts";

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
    const refresh = () => void queries.invalidateQueries({ queryKey: projectCatalogKey });
    const stop = platform.onLocalEvent((event) => {
      if (event.event === "engine.status") {
        refresh();
        if (event.data.status === "ready")
          void queries.invalidateQueries({ queryKey: ["instance"] });
      }
      if (event.event === "agent.changed") {
        const change = taskChangeSchema.safeParse(event.data.change);
        if (!change.success || change.data.type === "devices" || change.data.type === "reset")
          refresh();
      }
    });
    window.addEventListener("raypx:remote-change", refresh);
    return () => {
      stop();
      window.removeEventListener("raypx:remote-change", refresh);
    };
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
