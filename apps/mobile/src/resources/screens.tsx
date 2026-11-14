import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { Button } from "heroui-native/button";
import { Switch } from "heroui-native/switch";
import { Spinner } from "heroui-native/spinner";
import type { Skill } from "@raypx/core/skills";
import type { McpServer } from "@raypx/core/mcp-servers";
import type { OpenApiServer } from "@raypx/core/openapi-servers";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import type { MobilePagesController, MobileResourcesController } from "./controllers.js";

const StyledSafeAreaView = withUniwind(SafeAreaView);

/** Reads refresh on foreground; no cached server data is persisted locally. */
function useResourceController<T>(controller: {
  subscribe(this: void, listener: () => void): () => void;
  getSnapshot(this: void): T;
  load(): Promise<void>;
  dispose(): void;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    let started = false;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      started = true;
      void controller.load();
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void controller.load();
    });
    return () => {
      cancelled = true;
      subscription.remove();
      if (started) controller.dispose();
    };
  }, [controller]);
  return view;
}

export function PagesDirectory({
  controller,
  onBack,
}: {
  controller: MobilePagesController;
  onBack(this: void): void;
}) {
  const { t } = useCopy();
  const view = useResourceController(controller);
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <View className="w-full max-w-[800px] flex-1 self-center">
        <View className="gap-3 border-b border-border p-4">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
              {t("mobile-resources.pages")}
            </Text>
            <Action label={t("mobile-resources.back")} secondary onPress={onBack} />
          </View>
          <Action
            label={t("mobile-resources.openWeb")}
            disabled={Boolean(view.opening)}
            secondary
            onPress={() => void controller.open()}
          />
          {view.error ? (
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              {t("mobile-resources.error")}
            </Text>
          ) : null}
          <Action
            label={t("mobile-resources.retry")}
            busy={view.loading}
            secondary
            onPress={() => void controller.load()}
          />
        </View>
        <FlatList
          data={view.pages}
          keyExtractor={(page) => page.id}
          contentContainerClassName="grow gap-1 p-4"
          refreshing={view.loading}
          onRefresh={() => void controller.load()}
          ListEmptyComponent={
            view.loading ? (
              <Spinner accessibilityLabel={t("common.loading")} />
            ) : (
              <Text className="text-foreground">{t("mobile-resources.emptyPages")}</Text>
            )
          }
          renderItem={({ item }) => (
            <Button
              key={item.id}
              variant="ghost"
              accessibilityRole="link"
              accessibilityLabel={t("mobile-resources.pageOpen", { title: item.title })}
              isDisabled={Boolean(view.opening)}
              onPress={() => void controller.open(item)}
              className="h-auto min-h-14 min-w-0 items-start justify-start border-b border-border p-3"
            >
              <View className="min-w-0 flex-1 gap-1">
                <Button.Label className="shrink text-foreground">{item.title}</Button.Label>
                <Text className="text-sm text-muted-foreground">
                  {t(`mobile-resources.${item.kind}`)} ·{" "}
                  {t("mobile-resources.version", { version: item.version })}
                </Text>
              </View>
            </Button>
          )}
        />
      </View>
    </StyledSafeAreaView>
  );
}

type ResourceRow =
  | { kind: "skill"; value: Skill }
  | { kind: "server"; value: McpServer }
  | { kind: "api"; value: OpenApiServer };

export function ResourcesDirectory({
  controller,
  onBack,
  onManageWeb,
}: {
  controller: MobileResourcesController;
  onBack(this: void): void;
  onManageWeb(this: void): Promise<unknown>;
}) {
  const { t } = useCopy();
  const view = useResourceController(controller);
  const resources: ResourceRow[] = [
    ...controller.skills.getSnapshot().skills.map((value) => ({ kind: "skill" as const, value })),
    ...controller.servers
      .getSnapshot()
      .servers.map((value) => ({ kind: "server" as const, value })),
    ...controller.apis.getSnapshot().servers.map((value) => ({ kind: "api" as const, value })),
  ];
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <View className="w-full max-w-[800px] flex-1 self-center">
        <View className="gap-3 border-b border-border p-4">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
              {t("mobile-resources.resources")}
            </Text>
            <Action label={t("mobile-resources.back")} secondary onPress={onBack} />
          </View>
          <WebManagement onOpen={onManageWeb} />
          {!controller.agentId ? (
            <Text className="text-sm text-muted-foreground">
              {t("mobile-resources.chooseAgent")}
            </Text>
          ) : null}
          {!controller.canReadApis ? (
            <Text className="text-sm text-muted-foreground">{t("mobile-resources.apiOwner")}</Text>
          ) : null}
          {view.error ? (
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              {t("mobile-resources.error")}
            </Text>
          ) : null}
          <Action
            label={t("mobile-resources.retry")}
            busy={view.loading}
            disabled={view.busy}
            secondary
            onPress={() => void controller.load()}
          />
        </View>
        <FlatList
          data={resources}
          keyExtractor={(row) => `${row.kind}:${row.value.id}`}
          contentContainerClassName="grow gap-1 p-4"
          refreshing={view.loading}
          onRefresh={() => void controller.load()}
          ListEmptyComponent={
            view.loading ? (
              <Spinner accessibilityLabel={t("common.loading")} />
            ) : (
              <Text className="text-foreground">{t("mobile-resources.emptyResources")}</Text>
            )
          }
          renderItem={({ item }) => {
            if (item.kind === "api")
              return <ApiRow key={`api:${item.value.id}`} value={item.value} />;
            const resource = item.value;
            const available =
              resource.availability.mode === "all" ||
              resource.availability.spaceIds.includes(controller.spaceId);
            const selected =
              item.kind === "skill" ? view.selection.skillIds : view.selection.serverIds;
            return (
              <View
                key={`${item.kind}:${resource.id}`}
                className="gap-2 border-b border-border py-3"
              >
                <Text className="text-xs text-muted-foreground">
                  {t(
                    item.kind === "skill" ? "mobile-resources.skills" : "mobile-resources.servers",
                  )}
                </Text>
                <View className="min-w-0 flex-row flex-wrap items-center justify-between gap-3">
                  <Text className="min-w-0 shrink text-base font-medium text-foreground">
                    {resource.name}
                  </Text>
                  {controller.agentId ? (
                    <Switch
                      accessibilityRole="switch"
                      accessibilityLabel={t("mobile-resources.enabled", { name: resource.name })}
                      accessibilityState={{
                        checked: selected.includes(resource.id),
                        disabled: !available || view.loading || view.busy,
                      }}
                      isSelected={selected.includes(resource.id)}
                      isDisabled={!available || view.loading || view.busy}
                      onSelectedChange={(enabled) =>
                        void controller.toggle(item.kind, resource.id, enabled)
                      }
                    />
                  ) : null}
                </View>
                <Text className="text-sm text-muted-foreground">
                  {t(available ? "mobile-resources.available" : "mobile-resources.unavailableHere")}
                </Text>
                {item.kind === "server" || item.value.ownership === "account" ? (
                  <View className="gap-2">
                    <View className="flex-row flex-wrap items-center justify-between gap-3">
                      <Text className="shrink text-sm text-foreground">
                        {t("mobile-resources.allSpaces")}
                      </Text>
                      <Switch
                        accessibilityRole="switch"
                        accessibilityLabel={t("mobile-resources.allSpacesFor", {
                          name: resource.name,
                        })}
                        accessibilityState={{
                          checked: resource.availability.mode === "all",
                          disabled: view.loading || view.busy,
                        }}
                        isSelected={resource.availability.mode === "all"}
                        isDisabled={view.loading || view.busy}
                        onSelectedChange={(enabled) =>
                          void controller.setAllSpaces(item.kind, resource.id, enabled)
                        }
                      />
                    </View>
                    {resource.availability.mode === "selected" ? (
                      <View className="flex-row flex-wrap items-center justify-between gap-3">
                        <Text className="shrink text-sm text-foreground">
                          {t("mobile-resources.thisSpace")}
                        </Text>
                        <Switch
                          accessibilityRole="switch"
                          accessibilityLabel={t("mobile-resources.thisSpaceFor", {
                            name: resource.name,
                          })}
                          accessibilityState={{
                            checked: available,
                            disabled: view.loading || view.busy,
                          }}
                          isSelected={available}
                          isDisabled={view.loading || view.busy}
                          onSelectedChange={(enabled) =>
                            void controller.setCurrentSpace(item.kind, resource.id, enabled)
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {item.kind === "skill" ? (
                  <>
                    <Text className="text-sm text-foreground">{item.value.description}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {t(
                        item.value.ownership === "space"
                          ? "mobile-resources.spaceSkill"
                          : "mobile-resources.accountSkill",
                      )}
                    </Text>
                  </>
                ) : (
                  <Text selectable className="text-sm text-muted-foreground">
                    {item.value.url}
                  </Text>
                )}
              </View>
            );
          }}
        />
      </View>
    </StyledSafeAreaView>
  );
}

function ApiRow({ value }: { value: OpenApiServer }) {
  const { t } = useCopy();
  const selected = new Set(value.selectedOperationIds);
  return (
    <View className="gap-2 border-b border-border py-3">
      <Text className="text-xs text-muted-foreground">{t("mobile-resources.apis")}</Text>
      <Text className="text-base font-medium text-foreground">{value.name}</Text>
      <Text selectable className="text-sm text-muted-foreground">
        {value.url}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {t("mobile-resources.apiOperations", { count: value.selectedOperationIds.length })}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {value.availability.mode === "all"
          ? t("mobile-resources.apiAllAgents")
          : t("mobile-resources.apiSelectedAgents", { count: value.availability.agentIds.length })}
      </Text>
      {value.operations
        .filter((operation) => selected.has(operation.operationId))
        .map((operation) => (
          <Text key={operation.operationId} className="text-sm text-foreground">
            {operation.label} · {operation.method} ·{" "}
            {t(operation.readOnly ? "mobile-resources.readOnly" : "mobile-resources.change")}
          </Text>
        ))}
    </View>
  );
}

function WebManagement({ onOpen }: { onOpen(this: void): Promise<unknown> }) {
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function open() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onOpen();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View className="gap-2">
      <Action
        label={t("mobile-resources.manageWeb")}
        secondary
        busy={busy}
        onPress={() => void open()}
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("mobile-resources.error")}
        </Text>
      ) : null}
    </View>
  );
}
