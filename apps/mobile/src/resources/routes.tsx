import { useMemo } from "react";
import { Linking, Text } from "react-native";
import { useRouter } from "expo-router";
import { Spinner } from "heroui-native/spinner";
import { useRouteSelection } from "../agents/route-selection.js";
import { useCopy } from "../locale.js";
import { Action, Screen } from "../ui.js";
import { MobilePagesController, MobileResourcesController } from "./controllers.js";
import { PagesDirectory, ResourcesDirectory } from "./screens.js";

export function PagesRoute() {
  const { workspace, view, selected, current } = useRouteSelection();
  const router = useRouter();
  const membership = view.page.spaces.find(({ space }) => space.id === selected.spaceId);
  const spaceId = current && membership ? selected.spaceId : null;
  const controller = useMemo(() => {
    if (!workspace.api || !spaceId) return null;
    return new MobilePagesController(workspace.api.pages, spaceId, workspace.owner.origin, (url) =>
      Linking.openURL(url),
    );
  }, [workspace, spaceId]);
  if (!controller)
    return (
      <ResourceUnavailable
        loading={view.loading || view.refreshing}
        onBack={() => router.replace("/")}
      />
    );
  return (
    <PagesDirectory
      controller={controller}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}

export function ResourcesRoute() {
  const { workspace, view, selected, current, item } = useRouteSelection();
  const router = useRouter();
  const membership = view.page.spaces.find(({ space }) => space.id === selected.spaceId);
  const spaceId = current && membership ? selected.spaceId : null;
  const agentId = item?.agent.id;
  const missingAgent = Boolean(selected.agentId && !item);
  const owner = membership?.member.role === "owner";
  const controller = useMemo(() => {
    if (!workspace.api || !spaceId || missingAgent) return null;
    const api = workspace.api;
    return new MobileResourcesController(
      {
        skills: api.skills,
        mcpServers: api.mcpServers,
        openApiServers: api.openApiServers,
        directory: { spaces: api.spaces, agents: api.agents },
        capabilities: { skills: api.skills, mcpServers: api.mcpServers },
      },
      spaceId,
      agentId,
      owner,
    );
  }, [workspace, spaceId, agentId, missingAgent, owner]);
  if (!controller)
    return (
      <ResourceUnavailable
        loading={view.loading || view.refreshing}
        onBack={() => router.replace("/")}
      />
    );
  function manageWeb() {
    const url = new URL("/agents", workspace.owner.origin);
    if (selected.spaceId) url.searchParams.set("spaceId", selected.spaceId);
    url.hash = "settings/tools";
    return Linking.openURL(url.href);
  }
  return (
    <ResourcesDirectory
      controller={controller}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onManageWeb={manageWeb}
    />
  );
}

export function ResourceUnavailable({
  loading,
  onBack,
}: {
  loading: boolean;
  onBack(this: void): void;
}) {
  const { t } = useCopy();
  return (
    <Screen>
      {loading ? (
        <Spinner accessibilityLabel={t("common.loading")} />
      ) : (
        <Text accessibilityRole="alert" className="text-foreground">
          {t("mobile-resources.unavailable")}
        </Text>
      )}
      <Action label={t("mobile-resources.back")} secondary onPress={onBack} />
    </Screen>
  );
}
