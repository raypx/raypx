import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Text } from "react-native";
import { useRouteSelection } from "../../src/agents/route-selection.js";
import { MobileMemoryController } from "../../src/capabilities/memory-controller.js";
import { MobileMemoryScreen } from "../../src/capabilities/memory-screen.js";
import { useCopy } from "../../src/locale.js";
import { CapabilityAgentChooser } from "../../src/capabilities/agent-chooser.js";
import { Action, Screen } from "../../src/ui.js";

export default function SpaceMemoryRoute() {
  const { workspace, item, current, view, selected } = useRouteSelection();
  const router = useRouter();
  const { t } = useCopy();
  const port = workspace.port.spaceMemory;
  const [controller, setController] = useState<MobileMemoryController | null>(null);
  const agentId = item?.agent.id;
  const spaceId = item?.agent.spaceId;
  useEffect(() => {
    let cancelled = false;
    let next: MobileMemoryController | undefined;
    queueMicrotask(() => {
      if (cancelled || !current || !agentId || !spaceId || !port) return;
      next = new MobileMemoryController(spaceId, agentId, port);
      setController(next);
      void next.refresh();
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [current, agentId, spaceId, port]);
  if (current && !selected.agentId)
    return (
      <CapabilityAgentChooser
        title={t("memory.space.title")}
        agents={view.page.agents}
        loading={view.loading || view.refreshing}
        error={view.error}
        onChoose={(chosenAgentId) => router.setParams({ agentId: chosenAgentId })}
        onRefresh={() => void workspace.refresh(selected.spaceId)}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
      />
    );
  if (
    !controller ||
    !item ||
    controller.agentId !== item.agent.id ||
    controller.spaceId !== item.agent.spaceId
  )
    return (
      <Screen>
        <Text accessibilityRole="alert" className="text-foreground">
          {t("mobile-capabilities.unavailable")}
        </Text>
        <Action
          label={t("agents.refresh")}
          busy={view.refreshing}
          onPress={() => void workspace.refresh()}
        />
        <Action label={t("agents.back")} secondary onPress={() => router.replace("/")} />
      </Screen>
    );
  return (
    <MobileMemoryScreen
      controller={controller}
      agentName={item.agent.name}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
    />
  );
}
