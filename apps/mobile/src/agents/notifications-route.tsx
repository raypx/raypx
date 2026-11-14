import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Text } from "react-native";
import type { MemberNotification } from "@raypx/core/notifications";
import { useWorkspace } from "./provider.js";
import { useCopy } from "../locale.js";
import { Action, Screen } from "../ui.js";
import { NotificationsList } from "./notifications.js";
export function NotificationsRoute() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { t } = useCopy();
  const [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      workspace.leaveConversation();
    }, [workspace]),
  );
  async function open(item: MemberNotification) {
    await workspace.refresh(item.spaceId);
    if (!item.conversationId) {
      router.push({ pathname: "/space-settings", params: { spaceId: item.spaceId } });
      return;
    }
    const page = workspace.getSnapshot().page;
    const group = page.groups?.find((entry) => entry.conversation.id === item.conversationId);
    if (group) {
      router.push({
        pathname: "/group-conversation/[groupId]",
        params: { spaceId: item.spaceId, groupId: group.conversation.id, runId: item.runId ?? "" },
      });
      return;
    }
    const agent = page.agents.find((entry) => entry.conversation.id === item.conversationId);
    if (agent)
      router.push({
        pathname: "/conversation/[agentId]",
        params: { spaceId: item.spaceId, agentId: agent.agent.id, runId: item.runId ?? "" },
      });
  }
  if (!workspace.port.notifications)
    return (
      <Screen>
        <Text className="text-sm text-foreground">{t("agents.notifications.error")}</Text>
        <Action label={t("agents.back")} onPress={() => router.replace("/")} />
      </Screen>
    );
  return (
    <>
      {failed && <Text accessibilityRole="alert">{t("agents.notifications.error")}</Text>}
      <NotificationsList
        port={workspace.port.notifications}
        onOpen={(item) => {
          setFailed(false);
          void open(item).catch(() => setFailed(true));
        }}
        onBack={() => router.replace("/")}
      />
    </>
  );
}
