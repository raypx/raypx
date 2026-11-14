import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, Text, View } from "react-native";
import {
  NotificationsController,
  relativeActivityTime,
  type MemberNotificationsPort,
} from "@raypx/agents/model";
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
  const { t, locale } = useCopy();
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
  const groups = new Map<string, MemberNotification[]>();
  for (const item of view.items) {
    const items = groups.get(item.spaceId) ?? [];
    if (!groups.has(item.spaceId)) groups.set(item.spaceId, items);
    items.push(item);
  }
  return (
    <Screen>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
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
      {view.loading && (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          {t("agents.loading")}
        </Text>
      )}
      <View className="gap-6">
        {Array.from(groups, ([spaceId, items]) => (
          <View key={spaceId} className="gap-2">
            <Text accessibilityRole="header" className="text-sm font-medium text-muted-foreground">
              {items[0]?.spaceName}
            </Text>
            {items.map((item) => (
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
                  {relativeActivityTime(item.createdAt, locale, Date.now())}
                  {item.unread ? ` · ${t("agents.notifications.new")}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {view.truncated && (
        <Text className="text-xs text-muted-foreground">{t("agents.notifications.truncated")}</Text>
      )}
    </Screen>
  );
}
