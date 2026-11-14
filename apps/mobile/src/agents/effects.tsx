import { useEffect, useMemo, useSyncExternalStore } from "react";
import { FlatList, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { Spinner } from "heroui-native/spinner";
import {
  toolDisplayLabel,
  toolOperationLabel,
  type ApprovalPort,
  type ConversationSelection,
} from "@raypx/agents/model";
import type { RunId, ToolActivity } from "@raypx/core/conversation";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import { MobileEffectsController } from "./effects-controller.js";

const StyledSafeAreaView = withUniwind(SafeAreaView);
export function EffectRecords({
  port,
  selection,
  runId,
  activity,
}: {
  port: ApprovalPort;
  selection: ConversationSelection;
  runId: RunId;
  activity: readonly ToolActivity[];
}) {
  const { t } = useCopy();
  const { spaceId, conversationId } = selection;
  const controller = useMemo(
    () => new MobileEffectsController(port, { spaceId, conversationId }, runId),
    [port, spaceId, conversationId, runId],
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <>
      <Action label={t("agents.effects.open")} secondary onPress={() => void controller.open()} />
      <Modal visible={state.open} animationType="none" onRequestClose={() => controller.close()}>
        <StyledSafeAreaView className="flex-1 bg-background">
          <View
            accessibilityViewIsModal
            className="w-full max-w-[960px] flex-1 self-center gap-3 p-4"
          >
            <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
              {t("agents.effects.title")}
            </Text>
            <Text className="text-base text-muted-foreground">
              {t("agents.effects.description")}
            </Text>
            <Action label={t("agents.close")} secondary onPress={() => controller.close()} />
            {state.loading && <Spinner accessibilityLabel={t("agents.loading")} />}
            {state.error && (
              <View className="gap-2">
                <Text accessibilityRole="alert" className="text-foreground">
                  {t("agents.effects.error")}
                </Text>
                <Action
                  label={t("agents.refresh")}
                  secondary
                  onPress={() => void controller.refresh()}
                />
              </View>
            )}
            <FlatList
              data={state.records}
              keyExtractor={(effect) => effect.key}
              contentContainerClassName="gap-3"
              ListEmptyComponent={
                !state.loading && !state.error ? (
                  <Text className="text-muted-foreground">{t("agents.effects.empty")}</Text>
                ) : undefined
              }
              renderItem={({ item: effect }) => {
                const call = activity.find(
                  (entry) =>
                    entry.runId === effect.runId &&
                    entry.toolCallId === effect.toolCallId &&
                    entry.toolName === effect.toolName,
                );
                const label = call
                  ? toolOperationLabel(call, (key) => t(`agents.${key}`))
                  : toolDisplayLabel(effect.toolName, (key) => t(`agents.${key}`));
                return (
                  <View className="gap-1 border-b border-border py-3">
                    <Text className="text-base text-foreground">{label}</Text>
                    <Text className="text-sm text-muted-foreground">
                      {t(`agents.effects.states.${effect.state}`)}
                    </Text>
                    <Text selectable className="text-sm text-muted-foreground">
                      {effect.completedAt ?? effect.createdAt}
                    </Text>
                  </View>
                );
              }}
            />
          </View>
        </StyledSafeAreaView>
      </Modal>
    </>
  );
}
