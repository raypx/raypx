import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SpaceJoinController } from "@raypx/agents/model";
import { useWorkspace } from "../../src/agents/provider.js";
import { JoinSpaceScreen } from "../../src/spaces/screens.js";
import { Screen } from "../../src/ui.js";

export default function JoinSpaceRoute() {
  const workspace = useWorkspace();
  const router = useRouter();
  const params = useLocalSearchParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [controller, setController] = useState<SpaceJoinController | null>(null);
  useEffect(() => {
    let cancelled = false;
    let next: SpaceJoinController | undefined;
    queueMicrotask(() => {
      if (cancelled || !workspace.port.spaceManagement) return;
      next = new SpaceJoinController(workspace.port.spaceManagement);
      next.setToken(token);
      setController(next);
      void next.preview();
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [workspace, token]);
  if (!controller) return <Screen>{null}</Screen>;
  return (
    <JoinSpaceScreen
      controller={controller}
      onBack={() => router.replace("/")}
      onJoined={(spaceId) => {
        void workspace.refresh(spaceId);
        router.replace("/");
      }}
    />
  );
}
