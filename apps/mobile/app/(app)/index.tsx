import logoMark from "@raypx/ui/logo-mark.webp";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { Spinner } from "heroui-native/spinner";
import { authClient } from "../../src/auth.js";
import { useFocusEffect, useRouter } from "expo-router";
import { compareLastActivity, type AgentConversationView } from "@raypx/agents/model";
import type { MobileWorkspace } from "../../src/agents/workspace.js";
import { AgentHome } from "../../src/agents/home.js";
import { Action } from "../../src/ui.js";
import { AgentDirectory } from "../../src/agents/directory.js";
import { useWorkspace, useWorkspaceView } from "../../src/agents/provider.js";
import { useCopy } from "../../src/locale.js";

export default function AgentsScreen() {
  const workspace = useWorkspace();
  const view = useWorkspaceView();
  const router = useRouter();
  const { t } = useCopy();
  const session = authClient.useSession();
  const [focusVersion, setFocusVersion] = useState(0);
  const deleting = useRef(false);
  const [deleteError, setDeleteError] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [controllers, setControllers] = useState<ReturnType<
    MobileWorkspace["conversation"]
  > | null>(null);
  const target =
    view.page.agents.find((item) => item.agent.id === targetId) ??
    [...view.page.agents].sort((left, right) => compareLastActivity(left.agent, right.agent))[0];
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled || !target) return;
        workspace.enterConversation();
        setControllers(workspace.conversation(target));
      });
      return () => {
        cancelled = true;
        workspace.leaveConversation();
      };
    }, [workspace, target]),
  );
  function open(item: AgentConversationView) {
    setTargetId(item.agent.id);
    router.push({
      pathname: "/conversation/[agentId]",
      params: { agentId: item.agent.id, spaceId: item.agent.spaceId },
    });
  }
  function capability(pathname: "/routines" | "/space-memory" | "/resources") {
    if (view.page.spaceId)
      router.push({
        pathname,
        params: { spaceId: view.page.spaceId, ...(target ? { agentId: target.agent.id } : {}) },
      });
  }
  function context() {
    Alert.alert(t("mobile.addContext"), undefined, [
      { text: t("memory.space.title"), onPress: () => capability("/space-memory") },
      { text: t("mobile.resources"), onPress: () => capability("/resources") },
      { text: t("agents.cancel"), style: "cancel" },
    ]);
  }
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
  function create() {
    if (view.page.spaceId)
      router.push({ pathname: "/agent", params: { spaceId: view.page.spaceId } });
    else router.push("/space");
  }
  const emptyMessage = view.page.spaceId ? "agents.noAgents" : "agents.noSpaces";
  const createLabel = view.page.spaceId ? "agents.createAgent" : "agents.createSpace";
  let home: ReactNode = (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <Image source={logoMark} accessibilityLabel="Raypx" className="size-10" />
      <Text accessibilityRole="header" className="text-center text-2xl font-medium text-foreground">
        {t("mobile.homeQuestion")}
      </Text>
      {target && <Spinner accessibilityLabel={t("agents.loading")} />}
      {!target && !view.loading && (
        <>
          <Text className="text-center text-sm text-muted-foreground">{t(emptyMessage)}</Text>
          <Action label={t(createLabel)} onPress={create} />
        </>
      )}
    </View>
  );
  if (target && controllers?.id === target.agent.id)
    home = (
      <AgentHome
        key={target.conversation.id}
        item={target}
        focusVersion={focusVersion}
        agents={view.page.agents}
        models={view.page.models}
        controller={controllers.conversation}
        computer={controllers.computer}
        devices={controllers.devices}
        onSelect={setTargetId}
        onOpen={() => open(target)}
        onEdit={() => edit(target)}
        onContext={context}
      />
    );
  return (
    <>
      {deleteError ? (
        <Text accessibilityRole="alert" className="bg-background px-4 py-2 text-foreground">
          {t("agents.saveError")}
        </Text>
      ) : null}
      <AgentDirectory
        onNotifications={() => router.push("/notifications")}
        state={view.page}
        loading={view.loading}
        error={view.error}
        refreshing={view.refreshing}
        onRefresh={() => void workspace.refresh()}
        onSelectSpace={(id) => workspace.selectSpace(id)}
        onOpen={open}
        onOpenGroup={(item) =>
          router.push({
            pathname: "/group-conversation/[groupId]",
            params: { groupId: item.conversation.id, spaceId: item.conversation.spaceId },
          })
        }
        onRoutines={() => capability("/routines")}
        onMemory={() => capability("/space-memory")}
        onNew={() => setFocusVersion((value) => value + 1)}
        accountName={session.data?.user.name}
        home={home}
        onCreate={() => {
          if (view.page.spaceId)
            router.push({ pathname: "/agent", params: { spaceId: view.page.spaceId } });
        }}
        onEdit={edit}
        onDelete={remove}
        onAccount={() => router.push("/account")}
        onCreateSpace={() => router.push("/space")}
        onGroups={() => {
          if (view.page.spaceId)
            router.push({
              pathname: "/groups",
              params: { spaceId: view.page.spaceId, create: "1" },
            });
        }}
        onPages={() => {
          if (view.page.spaceId)
            router.push({ pathname: "/pages", params: { spaceId: view.page.spaceId } });
        }}
        onSpaceSettings={() => {
          if (view.page.spaceId)
            router.push({ pathname: "/space-settings", params: { spaceId: view.page.spaceId } });
        }}
        onResources={() => {
          if (view.page.spaceId)
            router.push({ pathname: "/resources", params: { spaceId: view.page.spaceId } });
        }}
      />
    </>
  );
}
