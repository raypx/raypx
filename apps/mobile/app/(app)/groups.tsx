import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Text } from "react-native";
import { parseAgentSelection } from "@raypx/agents/model";
import { useWorkspace, useWorkspaceView } from "../../src/agents/provider.js";
import { MobileGroupsController } from "../../src/groups/controller.js";
import { GroupsScreen } from "../../src/groups/screens.js";
import { useCopy } from "../../src/locale.js";
import { Action, Screen } from "../../src/ui.js";

export default function GroupsRoute() {
  const workspace = useWorkspace();
  const view = useWorkspaceView();
  const selected = parseAgentSelection(useLocalSearchParams());
  const router = useRouter();
  const { t } = useCopy();
  const [controller, setController] = useState<MobileGroupsController | null>(null);
  const spaceId = selected.spaceId;
  const membership = view.page.spaces.find((entry) => entry.space.id === spaceId);
  const admittedSpaceId = membership?.space.id;
  useEffect(() => {
    if (spaceId) void workspace.refresh(spaceId);
  }, [workspace, spaceId]);
  useEffect(() => {
    let cancelled = false;
    let next: MobileGroupsController | undefined;
    queueMicrotask(() => {
      if (cancelled || !admittedSpaceId || !workspace.port.groups) return;
      next = new MobileGroupsController(admittedSpaceId, workspace.port.groups);
      setController(next);
      void next.load();
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [workspace, admittedSpaceId]);
  if (controller && controller.spaceId === spaceId && membership)
    return (
      <GroupsScreen
        controller={controller}
        agents={view.page.agents.map((entry) => entry.agent)}
        onOpen={(group) =>
          router.push({
            pathname: "/group-conversation/[groupId]",
            params: { groupId: group.id, spaceId: group.spaceId },
          })
        }
        onBack={() => router.replace("/")}
        onDelete={(group) =>
          Alert.alert(
            t("agents.groups.deleteTitle", { name: group.name ?? "" }),
            t("agents.groups.deleteDescription"),
            [
              { text: t("agents.cancel"), style: "cancel" },
              {
                text: t("agents.groups.delete"),
                style: "destructive",
                onPress: () => {
                  void controller.remove(group.id);
                },
              },
            ],
          )
        }
      />
    );
  return (
    <Screen>
      <Text className="text-foreground">
        {t(view.error ? "agents.directoryError" : "agents.loading")}
      </Text>
      <Action label={t("agents.back")} secondary onPress={() => router.replace("/")} />
    </Screen>
  );
}
