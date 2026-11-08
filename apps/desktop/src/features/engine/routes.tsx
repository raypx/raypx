import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useDesktopEngine } from "./provider.tsx";

/** Mounted outside the gate so a failed initial loader can recover before its layout mounts. */
export function EngineRouteSync() {
  const { engine } = useDesktopEngine();
  const router = useRouter();
  useEffect(() => {
    if (engine.status === "ready")
      void router.invalidate({ filter: (match) => match.routeId.startsWith("/(local)") });
  }, [engine, router]);
  return null;
}
