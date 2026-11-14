import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { NotificationsController, type MemberNotificationsPort } from "@raypx/agents/model";
import type { MemberNotification } from "@raypx/core/notifications";
import { useCopy } from "../locale.js";
import { Action, Screen } from "../ui.js";

export function NotificationsList({
  port,
  onOpen,
  onBack,
}: {
  port: MemberNotificationsPort;
  onOpen: (item: MemberNotification) => void;
  onBack: () => void;
}) {
  const { t } = useCopy();
  const controller = useMemo(() => new NotificationsController(port), [port]);
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    const refresh = () => {
      if (AppState.currentState === "active") void controller.refresh();
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener("change", refresh);
    return () => {
      clearInterval(timer);
      subscription.remove();
      controller.dispose();
    };
  }, [controller]);
  return (
    <Screen>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text accessibilityRole="header" className="text-xl font-medium text-foreground">
          {t("agents.notifications.title")}
        </Text>
        <Action label={t("agents.back")} secondary onPress={onBack} />
        <Action
          label={t("agents.refresh")}
          secondary
          disabled={view.loading}
          onPress={() => void controller.refresh()}
        />
      </View>
      {view.error && (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("agents.notifications.error")}
        </Text>
      )}
      {!view.items.length && !view.loading && !view.error && (
        <Text className="text-sm text-muted-foreground">{t("agents.notifications.empty")}</Text>
      )}
      <ScrollView contentContainerClassName="gap-2" keyboardShouldPersistTaps="handled">
        {view.items.map((item) => (
          <View
            key={JSON.stringify([item.spaceId, item.kind, item.sourceId])}
            className="gap-1 border-b border-border py-2"
          >
            <Action
              label={t(`agents.notifications.${item.kind}`)}
              secondary
              onPress={() => {
                void controller.read(item).then((read) => {
                  if (read) onOpen(item);
                });
              }}
            />
            <Text className="text-xs text-muted-foreground">
              {item.spaceName} · {new Date(item.createdAt).toLocaleString()}
              {item.unread ? ` · ${t("agents.notifications.new")}` : ""}
            </Text>
          </View>
        ))}
      </ScrollView>
      {view.truncated && (
        <Text className="text-xs text-muted-foreground">{t("agents.notifications.truncated")}</Text>
      )}
    </Screen>
  );
}
