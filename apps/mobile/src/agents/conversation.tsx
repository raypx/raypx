import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { TextArea } from "heroui-native/text-area";
import { Label } from "heroui-native/label";
import { TextField } from "heroui-native/text-field";
import { Spinner } from "heroui-native/spinner";
import {
  conversationMemberLabel,
  delegatedWork,
  activeConversationRun,
  conversationTimelineRows,
  MAX_CONVERSATION_DRAFT,
  type AgentConversationView,
  type GroupConversationView,
  type ApprovalPort,
  mentionQueryAt,
  type ComputerController,
  type ConversationController,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import { ApprovalCard } from "./approval-card.js";
import { ComputerIndicator, ComputerSheet } from "./computer-sheet.js";
import { ReplyMarkdown } from "./markdown.js";
import { MentionSuggestions } from "../groups/mention-suggestions.js";
import { ToolActivity } from "./tool-activity.js";
import type { RunId } from "@raypx/core/conversation";

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
  group,
  approvalPort,
  onRoutines,
  onMemory,
  onResources,
  initialRunId,
  controller,
  computer,
  accountId,
  origin,
  onBack,
  onEdit,
}: {
  item?: AgentConversationView | undefined;
  group?: GroupConversationView | undefined;
  approvalPort?: ApprovalPort | undefined;
  onRoutines?: (() => void) | undefined;
  onMemory?: (() => void) | undefined;
  onResources?: (() => void) | undefined;
  initialRunId?: RunId | undefined;
  controller: ConversationController;
  computer: ComputerController;
  accountId: string;
  origin: string;
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
  const spaceId = group?.conversation.spaceId ?? item!.agent.spaceId;
  const conversationId = group?.conversation.id ?? item!.conversation.id;
  const title = group?.conversation.name ?? item?.agent.name ?? t("agents.groups.title");
  const agentName = (id: string | undefined) =>
    group?.agents.find((agent) => agent.id === id)?.name ??
    item?.agent.name ??
    t("agents.mentions.unknownAgent");
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof mentionQueryAt>>(null);
  const caret = useRef(0);
  const insertionCaret = useRef<number | null>(null);
  function queryMentions(text: string, position: number) {
    if (!group || state.pending) return;
    const range = mentionQueryAt(text, position);
    const selected = controller
      .getSnapshot()
      .mentionTokens?.some((token) => token.start === range?.start && position <= token.end);
    setMentionRange(selected ? null : range);
  }
  const [computerOpen, setComputerOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stopPending = useRef(false);
  const [away, setAway] = useState(false);
  const atBottom = useRef(true);
  const history = useRef<FlatList<TimelineRow>>(null);
  const editor = useRef<ComponentRef<typeof TextArea>>(null);
  const targetRun = useRef<string | null>(null);
  const openedRun = useRef<string | null>(null);
  useEffect(() => {
    if (!initialRunId || state.loading || openedRun.current === initialRunId) return;
    if (!state.runs.some((run) => run.id === initialRunId)) return;
    openedRun.current = initialRunId;
    atBottom.current = false;
    targetRun.current = initialRunId;
    void controller.loadRun(initialRunId);
  }, [initialRunId, state.loading, state.runs, controller]);
  useEffect(() => {
    if (insertionCaret.current === null) return;
    const position = insertionCaret.current;
    insertionCaret.current = null;
    editor.current?.setNativeProps({ selection: { start: position, end: position } });
  }, [state.draft]);
  const active = activeConversationRun(state.runs);
  const rows = conversationTimelineRows(state, state.cards);
  const outsideRuns = state.runs.filter(
    (run) => run.outsideWindow && ["queued", "running", "waiting"].includes(run.state),
  );
  useEffect(() => {
    if (!targetRun.current) return;
    const index = rows.findIndex(
      (row) => row.kind === "reply" && row.run?.id === targetRun.current,
    );
    if (index >= 0) {
      history.current?.scrollToIndex({ index, animated: false });
      targetRun.current = null;
    }
  }, [rows]);
  const memberName = (id: string) =>
    conversationMemberLabel(id, accountId, state.participants ?? [], undefined, {
      you: t("agents.you"),
      member: t("agents.member"),
      departed: (name) => t("agents.departedMember", { name }),
    });
  const shared = (state.participants ?? []).some((member) => member.accountId !== accountId);
  const firstVisible = useRef<string | null>(null);
  const scrollOffset = useRef(0);
  async function earlier() {
    atBottom.current = false;
    setAway(true);
    await controller.loadEarlier();
  }
  const rememberRow = useCallback(
    (row: TimelineRow | undefined, offset = 0) => {
      const projection = controller.getSnapshot();
      if (!row) return;
      let messageId: string | undefined;
      if (row.kind === "member") messageId = row.id;
      if (row.kind === "reply") messageId = row.run?.messageId;
      if (row.kind === "activity")
        messageId = projection.runs.find((run) => run.id === row.runId)?.messageId;
      if (row.kind === "approval")
        messageId = projection.runs.find((run) => run.id === row.card.runId)?.messageId;
      controller.setReadingAnchor(messageId && !atBottom.current ? { messageId, offset } : null);
    },
    [controller],
  );
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: TimelineRow }[] }) => {
      const first = viewableItems[0]?.item;
      firstVisible.current = first?.id ?? null;
      rememberRow(first, scrollOffset.current);
    },
    [rememberRow],
  );
  const lastRun = active ?? state.runs.at(-1);
  const pendingCards = rows.filter((row) => row.kind === "approval");
  async function stop(runId = active?.id) {
    if (!runId || stopPending.current) return;
    stopPending.current = true;
    setStopping(true);
    try {
      await controller.stop(runId);
    } finally {
      stopPending.current = false;
      setStopping(false);
    }
  }
  function latest() {
    controller.setReadingAnchor(null);
    atBottom.current = true;
    setAway(false);
    if (state.history?.hasNewer) void controller.loadLatest();
    history.current?.scrollToEnd({ animated: false });
  }
  function renderRow({ item: row }: { item: TimelineRow }) {
    if (row.kind === "approval")
      return (
        <ApprovalCard
          card={row.card}
          agentName={
            group
              ? agentName(state.runs.find((run) => run.id === row.card.runId)?.agentId)
              : undefined
          }
          memberName={memberName}
          accountId={accountId}
          onAnswer={(id, decision, allow) => void controller.answerApproval(id, decision, allow)}
          onRefresh={() => void controller.refreshApprovals()}
        />
      );
    if (row.kind === "activity")
      return (
        <View className="gap-1">
          {group && (
            <Text className="text-xs text-muted-foreground">
              {agentName(state.runs.find((run) => run.id === row.runId)?.agentId)}
            </Text>
          )}
          <ToolActivity
            spaceId={spaceId}
            origin={origin}
            row={row}
            approvalPort={approvalPort}
            selection={{ spaceId, conversationId }}
            answers={state.cards}
            memberName={shared ? memberName : undefined}
          />
        </View>
      );
    if (row.kind === "member")
      return (
        <View className="items-end">
          {(shared || group || row.agentId) && (
            <Text className="text-xs text-muted-foreground">
              {row.agentId
                ? agentName(row.agentId)
                : memberName(row.sender.slice("member:".length))}
            </Text>
          )}
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
        {group && (
          <Text className="text-sm font-semibold text-foreground">{agentName(row.agentId)}</Text>
        )}
        {run && ["queued", "running", "waiting"].includes(run.state) && (
          <View className="flex-row flex-wrap gap-2">
            {group && (
              <Action
                label={t("agents.mentions.stop", { name: agentName(run.agentId) })}
                secondary
                busy={stopping}
                onPress={() => void stop(run.id)}
              />
            )}
            <Action
              label={t("agents.stillWorking.steer")}
              secondary
              onPress={() => {
                controller.beginSteering(run.id);
                editor.current?.focus();
              }}
            />
          </View>
        )}
        {run?.trigger && run.trigger !== "message" && (
          <Text className="text-xs text-muted-foreground">
            {t(
              (run.provenanceKind ?? run.inboundProvenance?.kind) === "repository"
                ? "agents.origins.repository"
                : `agents.origins.${run.trigger}`,
            )}
          </Text>
        )}
        {(run?.untrustedInput ?? Boolean(run?.inboundProvenance)) && (
          <Text className="text-xs text-muted-foreground">{t("agents.untrustedInput")}</Text>
        )}
        {run &&
          delegatedWork(state, run.id).map((child) => (
            <View key={child.run.id} className="gap-1 border-l border-border pl-3">
              <Text className="text-sm text-foreground">
                {child.task.slice(0, 240) || t("agents.delegation.task")}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {agentName(child.run.agentId)} · {t(`agents.${child.run.state}`)}
              </Text>
              <ToolActivity
                spaceId={spaceId}
                origin={origin}
                row={{
                  id: `activity:${child.run.id}`,
                  kind: "activity",
                  sender: "approval",
                  sequence: 0,
                  runId: child.run.id,
                  activity: child.activity,
                  pendingCount: 0,
                }}
                approvalPort={approvalPort}
                selection={{ spaceId, conversationId }}
                answers={state.cards}
                memberName={shared ? memberName : undefined}
              />
            </View>
          ))}
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
                {title}
              </Text>
              <Action
                label={t(group ? "agents.groups.title" : "agents.editAgent")}
                secondary
                onPress={onEdit}
              />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {onRoutines && <Action label={t("routines.title")} secondary onPress={onRoutines} />}
              {onMemory && <Action label={t("memory.space.title")} secondary onPress={onMemory} />}
              {onResources && (
                <Action label={t("mobile.resources")} secondary onPress={onResources} />
              )}
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
          {state.toolActivityTruncated ? (
            <Text className="px-4 py-2 text-xs text-muted-foreground">
              {t("agents.activity.truncated")}
            </Text>
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
            onViewableItemsChanged={onViewableItemsChanged}
            ListHeaderComponent={
              !state.loading && state.history ? (
                <View className="gap-2 py-2">
                  {state.history.olderCursor ? (
                    <Action
                      label={t("agents.history.earlier")}
                      secondary
                      busy={state.history.loading !== null}
                      onPress={() => void earlier()}
                    />
                  ) : (
                    <Text className="text-center text-xs text-muted-foreground">
                      {t("agents.history.start")}
                    </Text>
                  )}
                  {state.history.error && (
                    <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
                      {t("agents.history.error")}
                    </Text>
                  )}
                </View>
              ) : undefined
            }
            ListFooterComponent={
              state.history?.hasNewer ? (
                <Action
                  label={t("agents.history.later")}
                  secondary
                  busy={state.history.loading !== null}
                  onPress={() => void controller.loadLater()}
                />
              ) : undefined
            }
            onScroll={({ nativeEvent }) => {
              const near =
                nativeEvent.contentSize.height -
                  nativeEvent.layoutMeasurement.height -
                  nativeEvent.contentOffset.y <
                80;
              scrollOffset.current = nativeEvent.contentOffset.y;
              atBottom.current = near;
              rememberRow(
                rows.find((row) => row.id === firstVisible.current),
                nativeEvent.contentOffset.y,
              );
              if (
                nativeEvent.contentOffset.y <= 48 &&
                !state.loading &&
                state.history?.olderCursor &&
                !state.history.loading
              )
                void earlier();
              if (near && state.history?.hasNewer && !state.history.loading)
                void controller.loadLater();
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
            {(outsideRuns.length > 0 || state.activeRunsTruncated) && (
              <View
                accessibilityLabel={t("agents.stillWorking.title")}
                className="gap-2 rounded-lg border border-border p-3"
              >
                <Text className="text-xs font-semibold text-foreground">
                  {t("agents.stillWorking.title")}
                </Text>
                {outsideRuns.map((run) => (
                  <View key={run.id} className="gap-2">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="min-w-0 flex-1 text-sm text-foreground">
                        {title} · {t(`agents.${run.state}`)}
                      </Text>
                      <Action
                        label={t("agents.stillWorking.showRun")}
                        secondary
                        busy={state.history.loading !== null}
                        onPress={() => {
                          atBottom.current = false;
                          setAway(true);
                          targetRun.current = run.id;
                          void controller.loadRun(run.id);
                        }}
                      />
                      <Action
                        label={t("agents.stillWorking.steer")}
                        secondary
                        onPress={() => {
                          controller.beginSteering(run.id);
                          editor.current?.focus();
                        }}
                      />
                      <Action
                        label={t("agents.stop")}
                        secondary
                        busy={stopping}
                        onPress={() => void stop(run.id)}
                      />
                    </View>
                    {run.trigger && run.trigger !== "message" && (
                      <Text className="text-xs text-muted-foreground">
                        {t(
                          (run.provenanceKind ?? run.inboundProvenance?.kind) === "repository"
                            ? "agents.origins.repository"
                            : `agents.origins.${run.trigger}`,
                        )}
                      </Text>
                    )}
                    {(run.untrustedInput ?? Boolean(run.inboundProvenance)) && (
                      <Text className="text-xs text-muted-foreground">
                        {t("agents.untrustedInput")}
                      </Text>
                    )}
                    {state.cards
                      .filter((card) => card.runId === run.id && card.state === "pending")
                      .map((card) => (
                        <ApprovalCard
                          key={card.requestId}
                          card={card}
                          agentName={group ? agentName(run.agentId) : undefined}
                          accountId={accountId}
                          memberName={memberName}
                          onAnswer={(id, decision, allow) =>
                            void controller.answerApproval(id, decision, allow)
                          }
                          onRefresh={() => void controller.refreshApprovals()}
                        />
                      ))}
                  </View>
                ))}
                {state.activeRunsTruncated && (
                  <View className="gap-2">
                    <Text className="text-xs text-muted-foreground">
                      {t("agents.stillWorking.truncated")}
                    </Text>
                    <Action
                      label={t("agents.refresh")}
                      secondary
                      busy={state.history.loading !== null}
                      onPress={() => void controller.loadLatest()}
                    />
                  </View>
                )}
              </View>
            )}
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
                  if (index >= 0) {
                    history.current?.scrollToIndex({ index, animated: false });
                    targetRun.current = null;
                  }
                }}
              />
            ) : null}
            {state.effectiveMode && (
              <Text className="text-xs text-muted-foreground">
                {t("agents.spaceSettings.effectiveMode")}:{" "}
                {t(`agents.approvalSettings.${state.effectiveMode.mode}`)} ·{" "}
                {t(
                  state.effectiveMode.source === "space_override"
                    ? "agents.spaceSettings.overridesDefault"
                    : "agents.spaceSettings.followsDefault",
                )}
              </Text>
            )}
            {state.sendCode && (
              <Text accessibilityRole="alert" className="text-sm text-foreground">
                {t(`agents.${state.sendCode}`)}
              </Text>
            )}
            {state.steeringRunId && (
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {t("agents.stillWorking.targeted", {
                    name: agentName(
                      state.runs.find((run) => run.id === state.steeringRunId)?.agentId,
                    ),
                  })}
                </Text>
                <Action
                  label={t("agents.stillWorking.cancelSteering")}
                  secondary
                  disabled={!!state.pending}
                  onPress={() => controller.clearSteering()}
                />
              </View>
            )}
            {group && mentionRange && (
              <MentionSuggestions
                agents={group.agents.filter((agent) =>
                  group.conversation.agentIds?.includes(agent.id),
                )}
                query={mentionRange.query}
                onSelect={(agent) => {
                  const position = controller.addMention(
                    mentionRange.start,
                    mentionRange.end,
                    agent.id,
                    agent.name,
                  );
                  caret.current = position;
                  insertionCaret.current = position;
                  setMentionRange(null);
                  editor.current?.focus();
                }}
                onClose={() => setMentionRange(null)}
              />
            )}
            <TextField className="gap-1">
              <Label>{t("agents.message")}</Label>
              <TextArea
                ref={editor}
                accessibilityLabel={t("agents.message")}
                value={state.draft}
                onChangeText={(text) => {
                  controller.setDraft(text);
                  caret.current = text.length;
                  queryMentions(text, text.length);
                }}
                onSelectionChange={({ nativeEvent }) => {
                  caret.current = nativeEvent.selection.start;
                  queryMentions(controller.getSnapshot().draft, caret.current);
                }}
                editable={!state.pending && !state.sending}
                maxLength={MAX_CONVERSATION_DRAFT}
                multiline
                textAlignVertical="top"
                className="max-h-36 min-h-12 px-3 py-2 text-base"
              />
            </TextField>
            {group &&
              !group.conversation.defaultResponderAgentId &&
              !state.mentionTokens?.length &&
              !state.steeringRunId && (
                <Text className="text-sm text-muted-foreground">
                  {t("agents.mentions.noReply")}
                </Text>
              )}
            <View className="flex-row flex-wrap justify-end gap-2">
              {active && !group ? (
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
                  setMentionRange(null);
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
