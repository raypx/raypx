import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";
import { parseAgentSelection } from "@raypx/agents/model";
import { AgentConversation } from "../../../src/agents/conversation.js";
import { useWorkspace, useWorkspaceView } from "../../../src/agents/provider.js";
import type { MobileWorkspace } from "../../../src/agents/workspace.js";
import { useCopy } from "../../../src/locale.js";
import { Action, Screen } from "../../../src/ui.js";

export default function GroupConversationRoute() {
  const workspace = useWorkspace();
  const view = useWorkspaceView();
  const selected = parseAgentSelection(useLocalSearchParams());
  const router = useRouter();
  const { t } = useCopy();
  const [controllers, setControllers] = useState<ReturnType<
    MobileWorkspace["groupConversation"]
  > | null>(null);
  useEffect(() => {
    if (selected.spaceId) void workspace.refresh(selected.spaceId);
  }, [workspace, selected.spaceId]);
  const group =
    view.page.spaceId === selected.spaceId
      ? view.page.groups?.find((entry) => entry.conversation.id === selected.groupId)
      : undefined;
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled || !group) return;
        const next = workspace.groupConversation(group);
        workspace.enterConversation();
        setControllers(next);
      });
      return () => {
        cancelled = true;
        workspace.leaveConversation();
      };
    }, [workspace, group]),
  );
  if (group && controllers?.id === `group:${group.conversation.id}`)
    return (
      <AgentConversation
        key={group.conversation.id}
        group={group}
        controller={controllers.conversation}
        computer={controllers.computer}
        devices={controllers.devices}
        accountId={workspace.owner.accountId}
        origin={workspace.owner.origin}
        approvalPort={workspace.port.approvals}
        onRoutines={() =>
          router.push({ pathname: "/routines", params: { spaceId: group.conversation.spaceId } })
        }
        onMemory={() =>
          router.push({
            pathname: "/space-memory",
            params: { spaceId: group.conversation.spaceId },
          })
        }
        onBack={() =>
          router.replace({ pathname: "/groups", params: { spaceId: group.conversation.spaceId } })
        }
        onEdit={() =>
          router.push({ pathname: "/groups", params: { spaceId: group.conversation.spaceId } })
        }
      />
    );
  return (
    <Screen>
      <Text accessibilityRole={view.error ? "alert" : "text"} className="text-foreground">
        {t(
          view.error || (!view.loading && !view.refreshing && !group)
            ? "agents.directoryError"
            : "agents.loading",
        )}
      </Text>
      <Action
        label={t("agents.refresh")}
        secondary
        onPress={() => void workspace.refresh(selected.spaceId)}
      />
      <Action label={t("agents.back")} onPress={() => router.replace("/")} />
    </Screen>
  );
}
