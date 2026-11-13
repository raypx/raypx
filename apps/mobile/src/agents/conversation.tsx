import { useRef, useState, useSyncExternalStore } from "react";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { TextArea } from "heroui-native/text-area";
import { Label } from "heroui-native/label";
import { TextField } from "heroui-native/text-field";
import { Spinner } from "heroui-native/spinner";
import {
  activeConversationRun,
  conversationTimelineRows,
  MAX_CONVERSATION_DRAFT,
  type AgentConversationView,
  type ComputerController,
  type ConversationController,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import { ApprovalCard } from "./approval-card.js";
import { ComputerIndicator, ComputerSheet } from "./computer-sheet.js";
import { ReplyMarkdown } from "./markdown.js";

const StyledSafeAreaView = withUniwind(SafeAreaView);
type TimelineRow = ReturnType<typeof conversationTimelineRows>[number];
const errorKeys = {
  load: "agents.loadError",
  send: "agents.sendError",
  stop: "agents.stopError",
  storage: "agents.storageError",
} as const;
const connectionKeys = {
  connecting: "agents.connecting",
  reconnecting: "agents.reconnecting",
  "snapshot-required": "agents.snapshotRequired",
} as const;

export function AgentConversation({
  item,
  controller,
  computer,
  accountId,
  onBack,
  onEdit,
}: {
  item: AgentConversationView;
  controller: ConversationController;
  computer: ComputerController;
  accountId: string;
  onBack(this: void): void;
  onEdit(this: void): void;
}) {
  const { t } = useCopy();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const computerState = useSyncExternalStore(
    computer.subscribe,
    computer.getSnapshot,
    computer.getSnapshot,
  );
  const [computerOpen, setComputerOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stopPending = useRef(false);
  const [away, setAway] = useState(false);
  const atBottom = useRef(true);
  const history = useRef<FlatList<TimelineRow>>(null);
  const active = activeConversationRun(state.runs);
  const rows = conversationTimelineRows(state, state.cards);
  const lastRun = state.runs.at(-1);
  const pendingCards = state.cards.filter((card) => card.state === "pending");
  async function stop() {
    if (!active || stopPending.current) return;
    stopPending.current = true;
    setStopping(true);
    try {
      await controller.stop(active.id);
    } finally {
      stopPending.current = false;
      setStopping(false);
    }
  }
  function latest() {
    atBottom.current = true;
    setAway(false);
    history.current?.scrollToEnd({ animated: false });
  }
  function renderRow({ item: row }: { item: TimelineRow }) {
    if (row.kind === "approval")
      return (
        <ApprovalCard
          card={row.card}
          accountId={accountId}
          onAnswer={(id, decision, allow) => void controller.answerApproval(id, decision, allow)}
          onRefresh={() => void controller.refreshApprovals()}
        />
      );
    if (row.kind === "activity")
      return (
        <View className="gap-2">
          {row.cards.map((card) => (
            <ApprovalCard
              key={card.requestId}
              card={card}
              accountId={accountId}
              onAnswer={() => {}}
              onRefresh={() => void controller.refreshApprovals()}
            />
          ))}
        </View>
      );
    if (row.kind === "member")
      return (
        <View className="items-end">
          <View className="max-w-[92%] rounded-lg bg-default px-3 py-2">
            <Text selectable className="text-base leading-6 text-foreground">
              {row.text}
            </Text>
          </View>
        </View>
      );
    const run = row.run;
    const message = state.messages.find((entry) => entry.id === run?.messageId);
    const retryDisabled =
      state.pending !== null || (state.draft !== "" && state.draft !== message?.text);
    return (
      <View className="gap-2 rounded-lg border border-border px-3 py-2">
        {row.text ? <ReplyMarkdown text={row.text} /> : null}
        {run ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
            {t(`agents.${run.state}`)}
            {run.failureCode ? ` · ${t(`agents.${run.failureCode}`)}` : ""}
          </Text>
        ) : null}
        {run?.state === "failed" && run.failureCode !== "EFFECT_UNKNOWN" && message ? (
          <>
            <Action
              label={t("agents.retry")}
              secondary
              disabled={retryDisabled}
              onPress={() => controller.prepareRetry(run.id)}
            />
            {retryDisabled ? (
              <Text className="text-sm text-muted-foreground">{t("agents.retryDraftHint")}</Text>
            ) : null}
          </>
        ) : null}
      </View>
    );
  }
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="w-full max-w-[960px] flex-1 self-center">
          <View className="gap-2 border-b border-border px-4 py-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Action label={t("agents.back")} secondary onPress={onBack} />
              <ComputerIndicator
                state={computerState}
                open={computerOpen}
                onOpen={() => setComputerOpen(true)}
              />
            </View>
            <View className="flex-row items-center justify-between gap-2">
              <Text
                accessibilityRole="header"
                className="min-w-0 flex-1 text-xl font-semibold text-foreground"
              >
                {item.agent.name}
              </Text>
              <Action label={t("agents.editAgent")} secondary onPress={onEdit} />
            </View>
            {state.connection !== "live" ? (
              <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
                {t(connectionKeys[state.connection])}
              </Text>
            ) : null}
          </View>
          {state.error ? (
            <View className="gap-1 px-4 py-2">
              <Text accessibilityRole="alert" className="text-sm text-foreground">
                {t(errorKeys[state.error])}
              </Text>
              {state.error === "load" ? (
                <Action
                  label={t("agents.refresh")}
                  secondary
                  onPress={() => controller.reconnect()}
                />
              ) : null}
            </View>
          ) : null}
          <FlatList
            ref={history}
            data={rows}
            accessibilityLabel={t("agents.conversation")}
            keyExtractor={(row) => row.id}
            renderItem={renderRow}
            contentContainerClassName="grow gap-3 p-4"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScroll={({ nativeEvent }) => {
              const near =
                nativeEvent.contentSize.height -
                  nativeEvent.layoutMeasurement.height -
                  nativeEvent.contentOffset.y <
                80;
              atBottom.current = near;
              setAway(!near);
            }}
            scrollEventThrottle={100}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              history.current?.scrollToOffset({
                offset: index * averageItemLength,
                animated: false,
              });
            }}
            onContentSizeChange={() => {
              if (atBottom.current) history.current?.scrollToEnd({ animated: false });
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-8">
                {state.loading ? (
                  <Spinner accessibilityLabel={t("agents.loading")} />
                ) : (
                  <Text className="text-base text-muted-foreground">
                    {t("agents.emptyConversation")}
                  </Text>
                )}
              </View>
            }
          />
          {away ? <Action label={t("agents.latest")} secondary onPress={latest} /> : null}
          <ScrollView
            className="max-h-[55%] grow-0 shrink-0 border-t border-border"
            contentContainerClassName="gap-2 px-4 py-2"
            keyboardShouldPersistTaps="handled"
          >
            {lastRun ? (
              <Text accessibilityLiveRegion="polite" className="text-xs text-muted-foreground">
                {t(`agents.${lastRun.state}`)}
              </Text>
            ) : null}
            {state.pending && !state.sending ? (
              <>
                <Text className="text-sm text-muted-foreground">{t("agents.pendingDelivery")}</Text>
                <Action
                  label={t("agents.retryDelivery")}
                  secondary
                  onPress={() => void controller.sendPending()}
                />
              </>
            ) : null}
            {state.approvalsError ? (
              <>
                <Text accessibilityRole="alert" className="text-sm text-foreground">
                  {t("agents.approval.loadError")}
                </Text>
                <Action
                  label={t("agents.refresh")}
                  secondary
                  busy={state.approvalsLoading}
                  onPress={() => void controller.refreshApprovals()}
                />
              </>
            ) : null}
            {pendingCards.length ? (
              <Action
                label={t("agents.approval.pendingCount", { count: pendingCards.length })}
                secondary
                onPress={() => {
                  atBottom.current = false;
                  const index = rows.findIndex((row) => row.kind === "approval");
                  if (index >= 0) history.current?.scrollToIndex({ index, animated: false });
                }}
              />
            ) : null}
            <TextField className="gap-1">
              <Label>{t("agents.message")}</Label>
              <TextArea
                accessibilityLabel={t("agents.message")}
                value={state.draft}
                onChangeText={(text) => controller.setDraft(text)}
                editable={!state.pending && !state.sending}
                maxLength={MAX_CONVERSATION_DRAFT}
                multiline
                textAlignVertical="top"
                className="max-h-36 min-h-12 px-3 py-2 text-base"
              />
            </TextField>
            <View className="flex-row flex-wrap justify-end gap-2">
              {active ? (
                <Action
                  label={t("agents.stop")}
                  secondary
                  busy={stopping}
                  onPress={() => void stop()}
                />
              ) : null}
              <Action
                label={t(state.sending ? "agents.sending" : "agents.send")}
                busy={state.sending}
                disabled={state.loading || !state.draft.trim() || !!state.pending}
                onPress={() => {
                  atBottom.current = true;
                  void controller.send();
                }}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      <ComputerSheet
        controller={computer}
        open={computerOpen}
        onClose={() => setComputerOpen(false)}
      />
    </StyledSafeAreaView>
  );
}
