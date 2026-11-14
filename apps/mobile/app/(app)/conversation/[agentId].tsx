import { useCallback, useState } from "react";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { runIdSchema } from "@raypx/core/conversation";
import { Text } from "react-native";
import { Spinner } from "heroui-native/spinner";
import { AgentConversation } from "../../../src/agents/conversation.js";
import { useRouteSelection } from "../../../src/agents/route-selection.js";
import type { MobileWorkspace } from "../../../src/agents/workspace.js";
import { useCopy } from "../../../src/locale.js";
import { Action, Screen } from "../../../src/ui.js";

export default function ConversationScreen() {
  const { workspace, view, selected, current, item } = useRouteSelection();
  const router = useRouter();
  const target = runIdSchema.safeParse(useLocalSearchParams().runId);
  const { t } = useCopy();
  const [controllers, setControllers] = useState<ReturnType<
    MobileWorkspace["conversation"]
  > | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled || !item) return;
        const next = workspace.conversation(item);
        workspace.enterConversation();
        setControllers(next);
      });
      return () => {
        cancelled = true;
        workspace.leaveConversation();
      };
    }, [workspace, item]),
  );
  if (item && controllers?.id === item.agent.id)
    return (
      <AgentConversation
        key={item.conversation.id}
        item={item}
        controller={controllers.conversation}
        computer={controllers.computer}
        devices={controllers.devices}
        accountId={workspace.owner.accountId}
        origin={workspace.owner.origin}
        initialRunId={target.success ? target.data : undefined}
        approvalPort={workspace.port.approvals}
        protectedInputsPort={workspace.port.protectedInputs}
        onRoutines={() =>
          router.push({
            pathname: "/routines",
            params: { spaceId: item.agent.spaceId, agentId: item.agent.id },
          })
        }
        onMemory={() =>
          router.push({
            pathname: "/space-memory",
            params: { spaceId: item.agent.spaceId, agentId: item.agent.id },
          })
        }
        onResources={() =>
          router.push({
            pathname: "/resources",
            params: { spaceId: item.agent.spaceId, agentId: item.agent.id },
          })
        }
        onBack={() => router.replace("/")}
        onEdit={() =>
          router.push({
            pathname: "/agent",
            params: { spaceId: item.agent.spaceId, agentId: item.agent.id },
          })
        }
      />
    );
  const failed =
    view.error || !selected.spaceId || (!view.loading && !view.refreshing && (!current || !item));
  return (
    <Screen>
      {failed ? (
        <>
          <Text accessibilityRole="alert" className="text-foreground">
            {t("agents.directoryError")}
          </Text>
          <Action
            label={t("agents.refresh")}
            secondary
            onPress={() => void workspace.refresh(selected.spaceId)}
          />
          <Action label={t("agents.back")} onPress={() => router.replace("/")} />
        </>
      ) : (
        <Spinner accessibilityLabel={t("agents.loading")} />
      )}
    </Screen>
  );
}
