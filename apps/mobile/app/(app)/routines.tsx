import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { setStringAsync } from "expo-clipboard";
import { Text } from "react-native";
import { useRouteSelection } from "../../src/agents/route-selection.js";
import { messageKey } from "../../src/agents/ports.js";
import { MobileRoutinesController } from "../../src/capabilities/routines-controller.js";
import { MobileRoutinesScreen } from "../../src/capabilities/routines-screen.js";
import { useCopy } from "../../src/locale.js";
import { CapabilityAgentChooser } from "../../src/capabilities/agent-chooser.js";
import { Action, Screen } from "../../src/ui.js";

export default function RoutinesRoute() {
  const { workspace, item, current, view, selected } = useRouteSelection();
  const router = useRouter();
  const { t } = useCopy();
  const port = workspace.port.routines;
  const [controller, setController] = useState<MobileRoutinesController | null>(null);
  const agentId = item?.agent.id;
  const spaceId = item?.agent.spaceId;
  useEffect(() => {
    let cancelled = false;
    let next: MobileRoutinesController | undefined;
    queueMicrotask(() => {
      if (cancelled || !current || !agentId || !spaceId || !port) return;
      next = new MobileRoutinesController(
        spaceId,
        agentId,
        port,
        messageKey,
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      );
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
        title={t("routines.title")}
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
    <MobileRoutinesScreen
      controller={controller}
      agentName={item.agent.name}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
      onCopy={async (value) => {
        await setStringAsync(value);
      }}
      onOpenRun={(conversationId, runId) => {
        if (conversationId !== item.conversation.id) return;
        router.push({
          pathname: "/conversation/[agentId]",
          params: { agentId: item.agent.id, spaceId: item.agent.spaceId, runId },
        });
      }}
    />
  );
}
