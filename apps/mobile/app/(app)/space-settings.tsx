import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { setStringAsync } from "expo-clipboard";
import { Alert, AppState, Text } from "react-native";
import { parseAgentSelection, SpaceManagementController } from "@raypx/agents/model";
import { useWorkspace, useWorkspaceView } from "../../src/agents/provider.js";
import { SpaceSettingsScreen } from "../../src/spaces/screens.js";
import { useCopy } from "../../src/locale.js";
import { Action, Screen } from "../../src/ui.js";

export default function SpaceSettingsRoute() {
  const workspace = useWorkspace();
  const view = useWorkspaceView();
  const { spaceId } = parseAgentSelection(useLocalSearchParams());
  const router = useRouter();
  const { t } = useCopy();
  const [controller, setController] = useState<SpaceManagementController | null>(null);
  const membership = view.page.spaces.find((entry) => entry.space.id === spaceId);
  const admittedSpaceId = membership?.space.id;
  const owner = membership?.member.role === "owner";
  useEffect(() => {
    if (spaceId) void workspace.refresh(spaceId);
  }, [workspace, spaceId]);
  useEffect(() => {
    let cancelled = false;
    let next: SpaceManagementController | undefined;
    queueMicrotask(() => {
      if (cancelled || !admittedSpaceId || !workspace.port.spaceManagement) return;
      next = new SpaceManagementController({
        spaceId: admittedSpaceId,
        accountId: workspace.owner.accountId,
        port: workspace.port.spaceManagement,
        ...(workspace.port.accountApprovalSettings
          ? { accountApprovals: workspace.port.accountApprovalSettings }
          : {}),
        ...(workspace.port.approvals ? { effectiveApprovals: workspace.port.approvals } : {}),
        onExitConfirmed() {
          void workspace.refresh();
          router.replace("/");
        },
      });
      setController(next);
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [workspace, admittedSpaceId, owner, router]);
  useEffect(() => {
    if (controller?.spaceId === membership?.space.id) void controller?.load(owner);
  }, [controller, membership?.space.id, owner, view.page.spaces]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void controller?.load(owner);
    });
    return () => listener.remove();
  }, [controller, owner]);
  if (controller && controller.spaceId === spaceId && membership)
    return (
      <SpaceSettingsScreen
        controller={controller}
        membership={membership}
        onBack={() => router.replace("/")}
        onCopy={async (link) => {
          await setStringAsync(link);
        }}
        onLeave={() =>
          Alert.alert(
            t("agents.spaceSettings.leaveTitle"),
            t("agents.spaceSettings.leaveConsequences"),
            [
              { text: t("agents.cancel"), style: "cancel" },
              {
                text: t("agents.spaceSettings.leave"),
                style: "destructive",
                onPress: () => {
                  void controller.leave();
                },
              },
            ],
          )
        }
        onRevoke={(id) =>
          Alert.alert(
            t("agents.spaceSettings.cancelInvitationTitle"),
            t("agents.spaceSettings.cancelInvitationConsequences"),
            [
              { text: t("agents.cancel"), style: "cancel" },
              {
                text: t("agents.spaceSettings.cancelInvitation"),
                style: "destructive",
                onPress: () => {
                  void controller.cancelInvitation(id);
                },
              },
            ],
          )
        }
        onRole={(member) => {
          const role = member.role === "owner" ? "member" : "owner";
          Alert.alert(
            t("agents.spaceSettings.changeRoleTitle", { name: member.name }),
            t(
              role === "owner"
                ? "agents.spaceSettings.makeOwnerConsequences"
                : "agents.spaceSettings.makeMemberConsequences",
            ),
            [
              { text: t("agents.cancel"), style: "cancel" },
              {
                text: t(
                  role === "owner"
                    ? "agents.spaceSettings.makeOwner"
                    : "agents.spaceSettings.makeMember",
                ),
                onPress: () => {
                  void controller.updateMemberRole(member.accountId, role);
                },
              },
            ],
          );
        }}
        onRemove={(member) =>
          Alert.alert(
            t("agents.spaceSettings.removeTitle", { name: member.name }),
            t("agents.spaceSettings.removeConsequences"),
            [
              { text: t("agents.cancel"), style: "cancel" },
              {
                text: t("agents.spaceSettings.remove"),
                style: "destructive",
                onPress: () => {
                  void controller.removeMember(member.accountId);
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
