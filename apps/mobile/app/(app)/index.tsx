import { useRef, useState } from "react";
import { Alert, Text } from "react-native";
import { useRouter } from "expo-router";
import type { AgentConversationView } from "@raypx/agents/model";
import { AgentDirectory } from "../../src/agents/directory.js";
import { useWorkspace, useWorkspaceView } from "../../src/agents/provider.js";
import { useCopy } from "../../src/locale.js";

export default function AgentsScreen() {
  const workspace = useWorkspace();
  const view = useWorkspaceView();
  const router = useRouter();
  const { t } = useCopy();
  const deleting = useRef(false);
  const [deleteError, setDeleteError] = useState(false);
  function edit(item: AgentConversationView) {
    router.push({
      pathname: "/agent",
      params: { spaceId: item.agent.spaceId, agentId: item.agent.id },
    });
  }
  function remove(item: AgentConversationView) {
    if (deleting.current) return;
    deleting.current = true;
    Alert.alert(
      t("agents.deleteTitle", { name: item.agent.name }),
      t("agents.deleteDescription"),
      [
        {
          text: t("agents.cancel"),
          style: "cancel",
          onPress: () => {
            deleting.current = false;
          },
        },
        {
          text: t("agents.deleteAgent"),
          style: "destructive",
          onPress: () => {
            setDeleteError(false);
            void workspace.port.agents
              .delete({ spaceId: item.agent.spaceId, id: item.agent.id })
              .then(
                () => workspace.refresh(),
                () => setDeleteError(true),
              )
              .finally(() => {
                deleting.current = false;
              });
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          deleting.current = false;
        },
      },
    );
  }
  return (
    <>
      {deleteError ? (
        <Text accessibilityRole="alert" className="bg-background px-4 py-2 text-foreground">
          {t("agents.saveError")}
        </Text>
      ) : null}
      <AgentDirectory
        state={view.page}
        loading={view.loading}
        error={view.error}
        refreshing={view.refreshing}
        onRefresh={() => void workspace.refresh()}
        onSelectSpace={(id) => workspace.selectSpace(id)}
        onOpen={(item) =>
          router.push({
            pathname: "/conversation/[agentId]",
            params: { agentId: item.agent.id, spaceId: item.agent.spaceId },
          })
        }
        onCreate={() => {
          if (view.page.spaceId)
            router.push({ pathname: "/agent", params: { spaceId: view.page.spaceId } });
        }}
        onEdit={edit}
        onDelete={remove}
        onAccount={() => router.push("/account")}
        onCreateSpace={() => router.push("/space")}
      />
    </>
  );
}
