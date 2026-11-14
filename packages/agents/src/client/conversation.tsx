/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The bounded transcript needs a keyboard scroll target. */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from "react";
import { ShellToolbar } from "@raypx/blocks/shell";
import { cn } from "@raypx/ui/lib/utils";
import { ReplyMarkdown } from "@raypx/blocks/markdown";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@raypx/ui/components/ui/input-group";
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia } from "@raypx/ui/components/ui/empty";
import { Alert, AlertDescription, AlertAction } from "@raypx/ui/components/ui/alert";
import { IconButton } from "@raypx/ui/icon-button";
import { HelpHint } from "@raypx/ui/help-hint";
import { AgentIcon } from "@raypx/icons/agent";
import { CloseIcon } from "@raypx/icons/close";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { RefreshIcon } from "@raypx/icons/refresh";
import { SendIcon } from "@raypx/icons/send";
import { StopIcon } from "@raypx/icons/stop";
import type { EffectiveApprovalMode } from "@raypx/core/approvals";
import type { Agent } from "@raypx/core/agents";
import type { SpaceDirectoryMember, SpaceSettings } from "@raypx/core/spaces";
import type { RunId, ToolActivity as ToolCallActivity } from "@raypx/core/conversation";
import {
  conversationMemberLabel,
  toolDisplayLabel,
  ConversationController,
  ComputerController,
  type ComputerPort,
  activeConversationRun,
  conversationTimelineRows,
  conversationSenderVisible,
  type AgentConversationView,
  type ConversationDraftStore,
  type ConversationSocketPort,
  type ConversationPort,
  type ApprovalCardView,
  type ApprovalPort,
} from "../model.js";
import { delegatedWork } from "../model/conversation.js";
import { mentionIds, mentionQueryAt } from "../model/mentions.js";
import type { GroupConversationView } from "../model/port.js";
import { MentionPicker } from "./mention-picker.js";
import { DelegatedWork } from "./delegated-work.js";
import { GroupAvatars } from "./group-directory.js";
import { Avatar, AvatarFallback } from "@raypx/ui/components/ui/avatar";
import { CapabilitySheet } from "./capability-sheet.js";
import { CapabilityPanels } from "./capability-panel.js";
import type { AgentsWorkspacePort } from "../model.js";
import { ComputerIndicator, ComputerPanel } from "./computer.js";
import { ApprovalCard } from "./approval-card.js";
import { ToolActivity } from "./tool-activity.js";
import { EffectRecords } from "./effects.js";
import { useTranslations } from "./i18n.js";

const connectionKeys = {
  connecting: "connecting",
  reconnecting: "reconnecting",
  "snapshot-required": "snapshotRequired",
} as const;
const errorKeys = {
  load: "loadError",
  send: "sendError",
  stop: "stopError",
  storage: "storageError",
} as const;

interface AgentConversationProps {
  onLastActivity?: ((at: string, conversationId: string) => void) | undefined;
  onOpenPage?: ((id: string) => void) | undefined;
  composerReference?: { id: string; text: string } | undefined;
  group?: GroupConversationView | undefined;
  agentDirectory?: readonly Agent[] | undefined;
  onManageParticipants?: (() => void) | undefined;
  capabilities?: Pick<AgentsWorkspacePort, "routines" | "spaceMemory"> | undefined;
  item: AgentConversationView;
  port: ConversationPort;
  computerPort: ComputerPort;
  approvalPort?: ApprovalPort | undefined;
  activity?: readonly ToolCallActivity[] | undefined;
  onActivity?: ((spaceId: string, calls: readonly ToolCallActivity[]) => void) | undefined;
  onComputerOpen?: (() => void) | undefined;
  socket: ConversationSocketPort;
  drafts: ConversationDraftStore;
  origin: string;
  accountId: string;
  /** Reserved for a conversation with multiple Agents; direct conversations omit names. */
  showAgentNames?: boolean;
  /** A mount may supply membership context when its data source exposes it. */
  hasOtherMembers?: boolean;
  members?: readonly SpaceDirectoryMember[] | undefined;
  effectiveMode?: EffectiveApprovalMode | null | undefined;
  spaceSettings?: SpaceSettings | null | undefined;
}

export function AgentConversation({
  onLastActivity,
  onOpenPage,
  composerReference,
  group,
  agentDirectory,
  onManageParticipants,
  capabilities,
  item,
  port,
  computerPort,
  approvalPort,
  activity,
  onActivity,
  onComputerOpen,
  socket,
  drafts,
  origin,
  accountId,
  showAgentNames = false,
  hasOtherMembers = false,
  members,
  spaceSettings,
  effectiveMode,
}: AgentConversationProps) {
  const t = useTranslations("agents");
  const referenceText = composerReference?.text;
  const [controllers, setControllers] = useState<{
    conversation: ConversationController;
    computer: ComputerController;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let next: ConversationController | undefined;
    let computer: ComputerController | undefined;
    queueMicrotask(() => {
      if (cancelled) return;
      computer = new ComputerController(item.agent.spaceId, computerPort, { accountId, socket });
      next = new ConversationController({
        computer,
        ...(approvalPort ? { approvals: approvalPort } : {}),
        selection: { spaceId: item.agent.spaceId, conversationId: item.conversation.id },
        owner: { origin, accountId },
        port,
        socket,
        drafts,
        key: () => crypto.randomUUID(),
      });
      setControllers({ conversation: next, computer });
      void computer.refresh();
      void next.start().then(() => {
        if (!cancelled && next && referenceText) {
          const draft = next.getSnapshot().draft;
          if (!draft.includes(referenceText))
            next.setDraft(draft ? `${draft}\n\n${referenceText}` : referenceText);
        }
      });
    });
    return () => {
      cancelled = true;
      next?.dispose();
      computer?.dispose();
    };
  }, [
    referenceText,
    item.agent.spaceId,
    item.conversation.id,
    origin,
    accountId,
    port,
    computerPort,
    approvalPort,
    socket,
    drafts,
  ]);
  if (!controllers)
    return (
      <Empty role="status">
        <EmptyTitle>{t("loading")}</EmptyTitle>
      </Empty>
    );
  return (
    <ConversationContents
      item={item}
      onOpenPage={onOpenPage}
      onLastActivity={onLastActivity}
      group={group}
      agentDirectory={agentDirectory}
      onManageParticipants={onManageParticipants}
      capabilities={capabilities}
      origin={origin}
      controller={controllers.conversation}
      computer={controllers.computer}
      accountId={accountId}
      showAgentNames={showAgentNames}
      hasOtherMembers={hasOtherMembers}
      members={members}
      spaceSettings={spaceSettings}
      effectiveMode={effectiveMode}
      approvalPort={approvalPort}
      activity={activity}
      onActivity={onActivity}
      onComputerOpen={onComputerOpen}
    />
  );
}

function ConversationContents({
  onLastActivity,
  onOpenPage,
  group,
  agentDirectory,
  onManageParticipants,
  capabilities,
  origin,
  item,
  controller,
  computer,
  accountId,
  showAgentNames,
  hasOtherMembers,
  members,
  spaceSettings,
  effectiveMode,
  approvalPort,
  activity,
  onActivity,
  onComputerOpen,
}: {
  onLastActivity: ((at: string, conversationId: string) => void) | undefined;
  onOpenPage: ((id: string) => void) | undefined;
  item: AgentConversationView;
  group: GroupConversationView | undefined;
  agentDirectory: readonly Agent[] | undefined;
  onManageParticipants: (() => void) | undefined;
  capabilities: Pick<AgentsWorkspacePort, "routines" | "spaceMemory"> | undefined;
  origin: string;
  controller: ConversationController;
  computer: ComputerController;
  accountId: string;
  showAgentNames: boolean;
  hasOtherMembers: boolean;
  members: readonly SpaceDirectoryMember[] | undefined;
  effectiveMode: EffectiveApprovalMode | null | undefined;
  spaceSettings: SpaceSettings | null | undefined;
  approvalPort: ApprovalPort | undefined;
  activity: readonly ToolCallActivity[] | undefined;
  onActivity: ((spaceId: string, calls: readonly ToolCallActivity[]) => void) | undefined;
  onComputerOpen: (() => void) | undefined;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const panelId = useId();
  const computerTrigger = useRef<HTMLButtonElement>(null);
  const capabilityMenuTrigger = useRef<HTMLButtonElement>(null);
  const computerMenuOpener = useRef<HTMLButtonElement | null>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const computerState = useSyncExternalStore(
    computer.subscribe,
    computer.getSnapshot,
    computer.getSnapshot,
  );
  function openComputer(opener: HTMLButtonElement | null = computerTrigger.current) {
    computerMenuOpener.current = opener === computerTrigger.current ? null : opener;
    setComputerOpen(true);
    onComputerOpen?.();
  }
  function computerFinalFocus() {
    const inline = window.matchMedia?.("(min-width: 640px)").matches ?? true;
    if (!inline && computerMenuOpener.current) return computerMenuOpener.current;
    return computerTrigger.current ?? false;
  }
  function closeComputer() {
    setComputerOpen(false);
    if (wide) computerTrigger.current?.focus();
  }
  const editor = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const composing = useRef(false);
  const dismissedMention = useRef<{ text: string; caret: number } | null>(null);
  const mentionCaret = useRef<number | null>(null);
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof mentionQueryAt>>(null);
  const [away, setAway] = useState(false);
  const [targetRun, setTargetRun] = useState<string | null>(null);
  const [stopping, setStopping] = useState<ReadonlySet<RunId>>(() => new Set());
  const [announcement, setAnnouncement] = useState({ revision: 0, text: "" });
  const observed = useRef(new Map<RunId, string>());
  const observedCards = useRef(new Map<string, string>());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { messages, runs, segments, liveReplies, cursor, toolActivity, toolActivityTruncated } =
    state;
  const rows = useMemo(
    () =>
      conversationTimelineRows(
        { messages, runs, segments, liveReplies, cursor, toolActivity, toolActivityTruncated },
        state.cards,
      ),
    [
      messages,
      runs,
      segments,
      liveReplies,
      cursor,
      toolActivity,
      toolActivityTruncated,
      state.cards,
    ],
  );
  useLayoutEffect(() => {
    if (!targetRun) return;
    const node = [...(history.current?.querySelectorAll<HTMLElement>("[data-run-id]") ?? [])].find(
      (row) => row.dataset.runId === targetRun,
    );
    if (!node) return;
    follow.current = false;
    node.scrollIntoView?.({ block: "center", behavior: "instant" });
    node.focus({ preventScroll: true });
    setTargetRun(null);
    anchor.current = {
      id: node.dataset.messageRow ?? "",
      offset:
        node.getBoundingClientRect().top - (history.current?.getBoundingClientRect().top ?? 0),
    };
  }, [targetRun, rows]);
  function openRun(runId: string) {
    setTargetRun(runId);
    void controller.loadRun(runId as RunId);
  }
  const pendingCards = useMemo(
    () =>
      state.cards.filter(
        (card) =>
          card.state === "pending" &&
          card.memberAccountId === accountId &&
          card.error !== "resolvedElsewhere" &&
          !state.toolActivity.some(
            (call) =>
              call.runId === card.runId &&
              call.toolCallId === card.toolCallId &&
              call.finishedAt !== null,
          ),
      ),
    [state.cards, state.toolActivity, accountId],
  );
  const outsideRuns = runs.filter(
    (run) => run.outsideWindow && ["queued", "running", "waiting"].includes(run.state),
  );
  const memberName = (memberAccountId: string) =>
    conversationMemberLabel(memberAccountId, accountId, state.participants ?? [], members, {
      you: t("you"),
      member: t("member"),
      departed: (name) => t("departedMember", { name }),
    });
  const senderContext = {
    showAgentNames: !!group || showAgentNames,
    hasOtherMembers:
      (members?.length ?? 0) > 1 ||
      (state.participants ?? []).some((member) => member.accountId !== accountId) ||
      hasOtherMembers ||
      messages.some(
        (message) => message.author.kind === "member" && message.author.accountId !== accountId,
      ),
  };
  const visibleSenders = useMemo(() => {
    const visible = new Set<string>();
    let previousSender: string | undefined;
    for (const row of rows) {
      if (row.kind !== "member" && row.kind !== "reply") continue;
      if (
        conversationSenderVisible(
          row.agentId ? "reply" : row.kind,
          {
            showAgentNames: senderContext.showAgentNames,
            hasOtherMembers: senderContext.hasOtherMembers,
          },
          previousSender === row.sender,
        )
      )
        visible.add(row.id);
      previousSender = row.sender;
    }
    return visible;
  }, [rows, senderContext.showAgentNames, senderContext.hasOtherMembers]);
  useEffect(() => {
    if (state.toolActivity.length) onActivity?.(item.agent.spaceId, state.toolActivity);
  }, [state.toolActivity, onActivity, item.agent.spaceId]);
  useEffect(() => {
    if (state.lastActivityAt) onLastActivity?.(state.lastActivityAt, item.conversation.id);
  }, [state.lastActivityAt, item.conversation.id, onLastActivity]);
  const appliedMode =
    effectiveMode?.mode ?? state.effectiveMode?.mode ?? spaceSettings?.approvalMode;
  const modeSource = effectiveMode?.source ?? state.effectiveMode?.source;
  const active = activeConversationRun(state.runs);
  const showStop = !group && active !== undefined && !state.draft.trim();
  const agentName = (agentId: string | undefined) => {
    if (!group) return item.agent.name;
    return (
      group.agents.find((agent) => agent.id === agentId)?.name ??
      agentDirectory?.find((agent) => agent.id === agentId)?.name ??
      t("mentions.unknownAgent")
    );
  };
  const conversationName = group?.conversation.name ?? item.agent.name;
  function closeMentions() {
    const node = editor.current;
    if (node) dismissedMention.current = { text: node.value, caret: node.selectionStart };
    setMentionRange(null);
    node?.focus();
  }
  function updateMentionPicker(node: HTMLTextAreaElement, explicit = false) {
    if (!group || composing.current || state.pending) return;
    const text = node.value;
    const caret = node.selectionStart;
    const dismissed = dismissedMention.current;
    if (!explicit && dismissed?.text === text && dismissed.caret === caret) return;
    const range = mentionQueryAt(text, caret);
    const selected = controller
      .getSnapshot()
      .mentionTokens?.some((token) => token.start === range?.start && caret <= token.end);
    if (selected && !explicit) {
      setMentionRange(null);
      return;
    }
    if (explicit) dismissedMention.current = null;
    setMentionRange(
      range ?? (explicit ? { start: caret, end: node.selectionEnd, query: "" } : null),
    );
  }
  let sendLabel = active ? t("sendDuringReply") : t("send");
  if (state.sending) sendLabel = t("sending");
  const sendDisabled =
    state.loading ||
    state.error === "load" ||
    state.sending ||
    !state.draft.trim() ||
    (state.pending !== null && state.pending.text !== state.draft);

  const resizeEditor = useCallback(() => {
    const node = editor.current;
    if (!node) return;
    // Keep growing on WebViews without field-sizing; Tailwind supplies the limits.
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, []);
  useLayoutEffect(resizeEditor, [state.draft, resizeEditor]);
  useLayoutEffect(() => {
    if (mentionCaret.current === null) return;
    const caret = mentionCaret.current;
    mentionCaret.current = null;
    editor.current?.focus();
    editor.current?.setSelectionRange(caret, caret);
  }, [state.draft]);
  useLayoutEffect(() => {
    const node = editor.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let width = node.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resizeEditor();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [resizeEditor]);

  useLayoutEffect(() => {
    title.current?.focus();
  }, []);
  // Only lifecycle changes reach this live region. Delta text stays outside it.
  useEffect(() => {
    const runIds = new Set(state.runs.map((run) => run.id));
    for (const runId of observed.current.keys())
      if (!runIds.has(runId)) observed.current.delete(runId);
    const cardIds = new Set<string>(state.cards.map((card) => card.requestId));
    for (const requestId of observedCards.current.keys())
      if (!cardIds.has(requestId)) observedCards.current.delete(requestId);
    let next = "";
    for (const run of state.runs) {
      const previous = observed.current.get(run.id);
      observed.current.set(run.id, run.state);
      if (previous === run.state) continue;
      if (run.state === "running") next = t("replying");
      else if (run.state === "waiting")
        next = t(run.computerInputPaused ? "screen.agentPaused" : "waiting");
      else if (previous === "running" || previous === "queued" || previous === "waiting") {
        if (run.state === "succeeded") next = t("replyReady");
        if (run.state === "failed") next = t("failed");
        if (run.state === "cancelled") next = t("cancelled");
      }
    }
    const cardAnnouncements: string[] = [];
    for (const card of state.cards) {
      const previous = observedCards.current.get(card.requestId);
      observedCards.current.set(card.requestId, card.state);
      if (!previous && card.state === "pending")
        cardAnnouncements.push(
          t("approval.announced", { tool: toolDisplayLabel(card.toolName, t) }),
        );
      else if (previous && previous !== card.state)
        cardAnnouncements.push(t(`approval.states.${card.state}`));
    }
    const text = cardAnnouncements.length ? cardAnnouncements.join(" ") : next;
    if (text)
      queueMicrotask(() =>
        setAnnouncement((previous) => ({ revision: previous.revision + 1, text })),
      );
  }, [state.runs, state.cards, t]);

  const restoreReading = useCallback(() => {
    const node = history.current;
    if (!node) return;
    if (follow.current) node.scrollTop = node.scrollHeight;
    else if (anchor.current) {
      const saved = anchor.current;
      const row = [...node.querySelectorAll<HTMLElement>("[data-message-row]")].find(
        (entry) => entry.dataset.messageRow === saved.id,
      );
      if (row)
        node.scrollTop +=
          row.getBoundingClientRect().top - node.getBoundingClientRect().top - saved.offset;
    }
  }, []);
  useLayoutEffect(restoreReading, [rows, state.history?.revision, restoreReading]);
  useLayoutEffect(() => {
    if (!content.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(restoreReading);
    observer.observe(content.current);
    if (history.current) observer.observe(history.current);
    return () => observer.disconnect();
  }, [restoreReading]);
  function captureReadingAnchor(node: HTMLDivElement) {
    const top = node.getBoundingClientRect().top;
    const first = [...node.querySelectorAll<HTMLElement>("[data-message-row]")].find(
      (row) => row.getBoundingClientRect().bottom > top,
    );
    anchor.current = first
      ? { id: first.dataset.messageRow ?? "", offset: first.getBoundingClientRect().top - top }
      : null;
    const row = rows.find((entry) => entry.id === first?.dataset.messageRow);
    const messageId = row?.kind === "member" ? row.id : undefined;
    let runId: string | undefined;
    if (row?.kind === "reply") runId = row.run?.id;
    if (row?.kind === "activity") runId = row.runId;
    if (row?.kind === "approval") runId = row.card.runId;
    const rootId = messageId ?? state.runs.find((entry) => entry.id === runId)?.messageId;
    controller.setReadingAnchor(
      rootId && !follow.current ? { messageId: rootId, offset: anchor.current?.offset ?? 0 } : null,
    );
  }
  function trackReading() {
    const node = history.current;
    if (!node) return;
    follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    setAway(!follow.current);
    captureReadingAnchor(node);
    if (
      node.scrollTop <= 48 &&
      !state.loading &&
      state.history?.olderCursor &&
      !state.history.loading
    )
      void loadEarlier();
    if (follow.current && state.history?.hasNewer && !state.history.loading)
      void controller.loadLater();
  }
  async function loadEarlier() {
    follow.current = false;
    if (history.current) captureReadingAnchor(history.current);
    setAway(true);
    await controller.loadEarlier();
  }
  function latest() {
    controller.setReadingAnchor(null);
    follow.current = true;
    anchor.current = null;
    setAway(false);
    if (state.history?.hasNewer) void controller.loadLatest();
    restoreReading();
    history.current?.focus();
  }
  async function send() {
    if (sendDisabled) return;
    await controller.send();
    editor.current?.focus();
  }
  async function retryDelivery() {
    await controller.sendPending();
    editor.current?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }
  async function stop(runId: RunId) {
    if (stopping.has(runId)) return;
    setStopping((current) => new Set([...current, runId]));
    try {
      await controller.stop(runId);
    } finally {
      setStopping((current) => new Set([...current].filter((candidate) => candidate !== runId)));
      editor.current?.focus();
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-clip">
      <section
        aria-label={t("conversation")}
        className="flex min-h-0 w-0 min-w-0 flex-1 flex-col gap-4 overflow-clip"
      >
        <ShellToolbar>
          <header
            data-conversation-header
            className="flex h-full min-w-0 flex-1 flex-row flex-nowrap items-center gap-2"
          >
            <h1
              ref={title}
              tabIndex={-1}
              title={conversationName}
              className="min-w-0 flex-1 truncate rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {conversationName}
            </h1>
            {group && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("groups.participants")}
                onClick={onManageParticipants}
              >
                <GroupAvatars agents={group.agents} />
              </Button>
            )}
            <div
              data-conversation-actions
              className="flex shrink-0 flex-row flex-nowrap items-center gap-1 whitespace-nowrap"
            >
              {capabilities && (
                <CapabilityPanels
                  item={item}
                  client={capabilities}
                  accountId={accountId}
                  origin={origin}
                  onOpenRun={openRun}
                  onOpen={() => setComputerOpen(false)}
                  onOpenComputer={openComputer}
                  menuTrigger={capabilityMenuTrigger}
                />
              )}
              <ComputerIndicator
                ref={computerTrigger}
                state={computerState}
                open={computerOpen}
                panelId={panelId}
                onOpen={() => {
                  if (computerOpen) closeComputer();
                  else openComputer();
                }}
              />
            </div>
          </header>
        </ShellToolbar>
        {state.connection !== "live" && state.error !== "load" && (
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <span role="status">{t(connectionKeys[state.connection])}</span>
            {state.connection === "reconnecting" && (
              <IconButton
                size="icon-sm"
                label={t("refresh")}
                onClick={() => controller.reconnect()}
              >
                <RefreshIcon aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
        {state.error && (
          <Alert>
            <AlertDescription>{t(errorKeys[state.error])}</AlertDescription>
            {state.error === "load" && (
              <AlertAction>
                <Button size="sm" variant="outline" onClick={() => controller.reconnect()}>
                  {t("refresh")}
                </Button>
              </AlertAction>
            )}
          </Alert>
        )}
        {state.sendCode && (
          <p role="status" className="text-xs text-muted-foreground">
            {t(state.sendCode)}
          </p>
        )}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!state.loading && state.history && (
            <div className="flex shrink-0 flex-col items-center gap-2 py-2">
              {state.history.olderCursor ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={state.history.loading !== null}
                  onClick={() => void loadEarlier()}
                >
                  {t("history.earlier")}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{t("history.start")}</p>
              )}
              {state.history.loading && (
                <p role="status" className="text-xs text-muted-foreground">
                  {t("history.loading")}
                </p>
              )}
              {state.history.error && (
                <p role="alert" className="text-xs text-muted-foreground">
                  {t("history.error")}
                </p>
              )}
            </div>
          )}

          <div
            ref={history}
            data-history-count={state.messages.length}
            role="log"
            aria-live="off"
            aria-label={t("conversation")}
            tabIndex={0}
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [overflow-anchor:none]"
            onScroll={trackReading}
          >
            <div ref={content} className="flex min-h-full min-w-0 flex-col gap-2 pb-2">
              {(state.runsTruncated ||
                state.segmentsTruncated ||
                state.resolvedApprovalsTruncated ||
                state.participantsTruncated) && (
                <p className="text-xs text-muted-foreground">{t("history.truncated")}</p>
              )}
              {state.toolActivityTruncated && (
                <p className="text-xs text-muted-foreground">{t("activity.truncated")}</p>
              )}
              {state.loading && (
                <Empty role="status">
                  <EmptyTitle>{t("loading")}</EmptyTitle>
                </Empty>
              )}
              {rows.length === 0 && !state.loading && state.error !== "load" && (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <AgentIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>{t("emptyConversation")}</EmptyTitle>
                  </EmptyHeader>
                  <Button variant="outline" onClick={() => editor.current?.focus()}>
                    {t("focusMessage")}
                  </Button>
                </Empty>
              )}
              {rows.map((row, index) => {
                if (row.kind === "activity")
                  return (
                    <ToolActivity
                      onOpenPage={onOpenPage}
                      key={row.id}
                      runId={row.runId}
                      activity={row.activity}
                      pendingCount={row.pendingCount}
                      approvalPort={approvalPort}
                      answers={state.cards}
                      memberName={senderContext.hasOtherMembers ? memberName : undefined}
                      selection={{
                        spaceId: item.agent.spaceId,
                        conversationId: item.conversation.id,
                      }}
                    />
                  );
                if (row.kind === "approval") {
                  const asking = state.runs.find((run) => run.id === row.card.runId);
                  return (
                    <ApprovalCard
                      key={row.id}
                      card={row.card}
                      agentName={group ? agentName(asking?.agentId) : undefined}
                      taskSummary={asking?.parentRunId ? t("delegation.task") : undefined}
                      accountId={accountId}
                      memberName={memberName}
                      onAnswer={(decision, allowTool) =>
                        controller.answerApproval(row.card.requestId, decision, allowTool)
                      }
                      onExpired={() => void controller.refreshApprovals()}
                      onAnswered={() => editor.current?.focus()}
                    />
                  );
                }
                const showSender = visibleSenders.has(row.id);
                if (row.kind === "member" && row.agentId)
                  return (
                    <article
                      key={row.id}
                      data-message-row={row.id}
                      data-message-id={row.id.startsWith("message:") ? row.id.slice(8) : row.id}
                      data-agent-message={row.agentId}
                      className="flex min-w-0 flex-col gap-1 pr-6"
                    >
                      {showSender && (
                        <h3 className="flex min-w-0 items-center gap-2 text-xs font-medium">
                          <Avatar size="sm" aria-hidden="true">
                            <AvatarFallback>{agentName(row.agentId).slice(0, 1)}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{agentName(row.agentId)}</span>
                        </h3>
                      )}
                      {!!row.targetAgentIds?.length && (
                        <p className="text-xs text-muted-foreground wrap-anywhere">
                          {t("mentions.to", { name: row.targetAgentIds.map(agentName).join(", ") })}
                        </p>
                      )}
                      <p className="max-w-[90%] rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere">
                        {row.text}
                      </p>
                    </article>
                  );
                if (row.kind === "member")
                  return (
                    <article
                      key={row.id}
                      data-message-row={row.id}
                      data-message-id={row.id.startsWith("message:") ? row.id.slice(8) : row.id}
                      className={cn(
                        "flex min-w-0 flex-col items-end gap-1 pl-6",
                        index > 0 && rows[index - 1]?.kind !== "member" && "mt-4",
                      )}
                    >
                      {showSender && (
                        <h3 className="text-xs font-medium text-muted-foreground">
                          {memberName(row.sender.slice("member:".length))}
                        </h3>
                      )}
                      <p className="max-w-[90%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere">
                        {row.text}
                      </p>
                    </article>
                  );
                const run = row.run;
                const work = run ? delegatedWork(state, run.id) : [];
                const waitingOnWork =
                  work.some((child) =>
                    ["queued", "running", "waiting"].includes(child.run.state),
                  ) &&
                  state.toolActivity.some(
                    (call) =>
                      call.runId === run?.id &&
                      call.toolName === "agent_wait" &&
                      call.outcome === null,
                  );
                const producing = run?.state === "running" || run?.state === "queued";
                let runStatus = run ? t(run.state) : "";
                if (run?.state === "running") runStatus = t("replying");
                if (waitingOnWork) runStatus = t("delegation.waiting");
                if (run?.computerInputPaused) runStatus = t("screen.agentPaused");
                const retryMessage = state.messages.find(
                  (message) => message.id === run?.messageId,
                );
                const retryDisabled =
                  state.pending !== null ||
                  (state.draft !== "" && state.draft !== retryMessage?.text);
                return (
                  <article
                    key={row.id}
                    data-message-row={row.id}
                    data-run-id={run?.id}
                    tabIndex={-1}
                    aria-busy={producing}
                    className="flex min-w-0 flex-col pr-6"
                  >
                    <div className="flex w-fit min-w-0 max-w-[90%] flex-col gap-2">
                      {run?.trigger && run.trigger !== "message" && (
                        <p className="text-xs text-muted-foreground" data-run-origin>
                          {(run.provenanceKind ?? run.inboundProvenance?.kind) === "repository"
                            ? t("origins.repository")
                            : t(`origins.${run.trigger}`)}
                        </p>
                      )}
                      {(run?.untrustedInput ?? Boolean(run?.inboundProvenance)) && (
                        <p className="text-xs text-muted-foreground" data-untrusted-input>
                          {t("untrustedInput")}
                        </p>
                      )}
                      {showSender && (
                        <h3
                          title={agentName(row.agentId)}
                          className="flex min-w-0 items-center gap-2 text-xs font-medium"
                        >
                          <Avatar size="sm" aria-hidden="true">
                            <AvatarFallback>{agentName(row.agentId).slice(0, 1)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 truncate">{agentName(row.agentId)}</span>
                        </h3>
                      )}
                      <div
                        data-reply-bubble
                        className="min-w-0 rounded-lg border px-3 py-2 text-sm"
                      >
                        {row.text && (
                          <ReplyMarkdown
                            copyLabel={t("copyCode")}
                            copiedLabel={t("codeCopied")}
                            copyErrorLabel={t("copyCodeError")}
                          >
                            {row.text}
                          </ReplyMarkdown>
                        )}
                        {run && run.state !== "succeeded" && (
                          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className={row.text ? "mt-2" : undefined}>{runStatus}</span>
                            {run.failureCode && (
                              <span className="wrap-anywhere">{t(run.failureCode)}</span>
                            )}
                            {run.failureCode === "EFFECT_UNKNOWN" && approvalPort && (
                              <EffectRecords
                                port={approvalPort}
                                selection={{
                                  spaceId: item.agent.spaceId,
                                  conversationId: item.conversation.id,
                                }}
                                runId={run.id}
                              />
                            )}
                            {run.state === "failed" &&
                              run.failureCode !== "EFFECT_UNKNOWN" &&
                              retryMessage && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={retryDisabled}
                                    onClick={() => {
                                      if (controller.prepareRetry(run.id)) editor.current?.focus();
                                    }}
                                  >
                                    {t("retry")}
                                  </Button>
                                  {retryDisabled && (
                                    <HelpHint
                                      label={t("retry")}
                                      description={t("retryDraftHint")}
                                    />
                                  )}
                                </>
                              )}
                          </div>
                        )}
                      </div>
                      {group && run && ["queued", "running", "waiting"].includes(run.state) && (
                        <IconButton
                          size="icon-sm"
                          variant="ghost"
                          label={t("mentions.stop", { name: agentName(row.agentId) })}
                          disabled={stopping.has(run.id)}
                          onClick={() => void stop(run.id)}
                        >
                          <StopIcon aria-hidden="true" />
                        </IconButton>
                      )}
                      {run && (
                        <DelegatedWork
                          work={work}
                          parentRunId={run.id}
                          agentName={group ? agentName : undefined}
                          answers={state.cards}
                          approvalPort={approvalPort}
                          selection={{
                            spaceId: item.agent.spaceId,
                            conversationId: item.conversation.id,
                          }}
                          memberName={senderContext.hasOtherMembers ? memberName : undefined}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
              {state.history?.hasNewer && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={state.history.loading !== null}
                  onClick={() => void controller.loadLater()}
                >
                  {t("history.later")}
                </Button>
              )}
            </div>
          </div>
          {away && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center">
              <Button size="sm" variant="outline" onClick={latest}>
                <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
                {t("latest")}
              </Button>
            </div>
          )}
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          <span key={announcement.revision}>{announcement.text}</span>
        </p>
        {state.pending && !state.sending && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">{t("pendingDelivery")}</p>
            <Button variant="outline" size="sm" onClick={() => void retryDelivery()}>
              {t("retryDelivery")}
            </Button>
          </div>
        )}
        {state.approvalsError && (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p>{t("approval.loadError")}</p>
            <Button
              size="sm"
              variant="ghost"
              disabled={state.approvalsLoading}
              onClick={() => void controller.refreshApprovals()}
            >
              {t("refresh")}
            </Button>
          </div>
        )}
        {(outsideRuns.length > 0 || state.activeRunsTruncated) && (
          <div
            role="region"
            aria-label={t("stillWorking.title")}
            data-still-working
            className="max-h-[min(24rem,50dvh)] min-w-0 shrink-0 overflow-y-auto rounded-lg border sm:max-h-64"
          >
            <h3 className="px-3 pt-2 text-xs font-medium">{t("stillWorking.title")}</h3>
            {outsideRuns.map((run) => (
              <div key={run.id} data-active-run-id={run.id} className="min-w-0 space-y-2 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                  <div className="flex min-w-0 basis-full items-start justify-between gap-2 sm:basis-auto sm:flex-1">
                    <span className="min-w-0 font-medium wrap-anywhere">
                      {agentName(run.agentId)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {t(run.computerInputPaused ? "screen.agentPaused" : run.state)}
                    </span>
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={state.history.loading !== null}
                    onClick={() => openRun(run.id)}
                  >
                    {t("stillWorking.showRun")}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      controller.beginSteering(run.id);
                      editor.current?.focus();
                    }}
                  >
                    {t("stillWorking.steer")}
                  </Button>
                  <IconButton
                    size="icon-xs"
                    variant="ghost"
                    label={t("mentions.stop", { name: agentName(run.agentId) })}
                    disabled={stopping.has(run.id)}
                    onClick={() => void stop(run.id)}
                  >
                    <StopIcon aria-hidden="true" />
                  </IconButton>
                </div>
                {run.trigger && run.trigger !== "message" && (
                  <p className="text-xs text-muted-foreground">
                    {(run.provenanceKind ?? run.inboundProvenance?.kind) === "repository"
                      ? t("origins.repository")
                      : t(`origins.${run.trigger}`)}
                  </p>
                )}
                {(run.untrustedInput ?? Boolean(run.inboundProvenance)) && (
                  <p className="text-xs text-muted-foreground">{t("untrustedInput")}</p>
                )}
                {pendingCards
                  .filter((card) => card.runId === run.id)
                  .map((card) => (
                    <ApprovalCard
                      key={card.requestId}
                      card={card}
                      accountId={accountId}
                      onAnswer={(decision, allowTool) =>
                        controller.answerApproval(card.requestId, decision, allowTool)
                      }
                      onExpired={() => void controller.refreshApprovals()}
                      onAnswered={() => editor.current?.focus()}
                    />
                  ))}
              </div>
            ))}
            {state.activeRunsTruncated && (
              <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
                <p className="min-w-0 flex-1">{t("stillWorking.truncated")}</p>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={state.history.loading !== null}
                  onClick={() => void controller.loadLatest()}
                >
                  {t("refresh")}
                </Button>
              </div>
            )}
          </div>
        )}
        {state.steeringRunId && (
          <div className="flex min-w-0 shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {t("stillWorking.targeted", {
                name: agentName(runs.find((run) => run.id === state.steeringRunId)?.agentId),
              })}
            </span>
            <IconButton
              size="icon-xs"
              variant="ghost"
              label={t("stillWorking.cancelSteering")}
              disabled={!!state.pending}
              onClick={() => controller.clearSteering()}
            >
              <CloseIcon aria-hidden="true" />
            </IconButton>
          </div>
        )}
        <form onSubmit={submit} className="min-w-0 shrink-0">
          <Field>
            <FieldLabel htmlFor={id} className="sr-only">
              {t("message")}
            </FieldLabel>
            {group && mentionRange && (
              <MentionPicker
                agents={group.agents}
                query={mentionRange.query}
                editor={editor}
                onClose={closeMentions}
                onSelect={(agent) => {
                  const caret = controller.addMention(
                    mentionRange.start,
                    mentionRange.end,
                    agent.id,
                    agent.name,
                  );
                  mentionCaret.current = caret;
                  closeMentions();
                }}
              />
            )}
            <InputGroup>
              <InputGroupTextarea
                ref={editor}
                id={id}
                value={state.draft}
                rows={1}
                maxLength={32_000}
                placeholder={t("message")}
                className="max-h-48 min-h-16 overflow-y-auto"
                onChange={(event) => {
                  controller.setDraft(event.currentTarget.value);
                  updateMentionPicker(event.currentTarget);
                }}
                aria-keyshortcuts={group ? "Control+Shift+M Meta+Shift+M" : undefined}
                onSelect={(event) => updateMentionPicker(event.currentTarget)}
                onCompositionStart={() => {
                  composing.current = true;
                  setMentionRange(null);
                }}
                onCompositionEnd={(event) => {
                  composing.current = false;
                  controller.setDraft(event.currentTarget.value);
                  updateMentionPicker(event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)
                    return;
                  if (
                    group &&
                    (event.ctrlKey || event.metaKey) &&
                    event.shiftKey &&
                    event.key.toLowerCase() === "m"
                  ) {
                    event.preventDefault();
                    updateMentionPicker(event.currentTarget, true);
                    return;
                  }
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    composing.current ||
                    event.nativeEvent.isComposing ||
                    event.keyCode === 229
                  )
                    return;
                  event.preventDefault();
                  void send();
                }}
              />
              <InputGroupAddon align="block-end" className="flex-wrap justify-end">
                {group &&
                  state.draft.trim() &&
                  mentionIds(state.mentionTokens ?? []).length === 0 && (
                    <span className="mr-auto min-w-0 text-xs wrap-anywhere text-muted-foreground">
                      {t("mentions.noReply")}
                    </span>
                  )}
                {appliedMode && (
                  <span className="min-w-0 flex-1 text-xs wrap-anywhere text-muted-foreground">
                    {t(
                      modeSource !== "account_default"
                        ? "spaceSettings.overridesDefault"
                        : "spaceSettings.followsDefault",
                    )}
                    : {t(`approvalSettings.${appliedMode}`)}
                  </span>
                )}
                <PendingApprovalControl
                  cards={pendingCards.filter(
                    (card) => !outsideRuns.some((run) => run.id === card.runId),
                  )}
                  history={history}
                />
                {showStop && active ? (
                  <IconButton
                    variant="default"
                    label={t("stop")}
                    disabled={stopping.size > 0}
                    onClick={() => void stop(active.id)}
                  >
                    <StopIcon aria-hidden="true" />
                  </IconButton>
                ) : (
                  <IconButton
                    type="submit"
                    variant="default"
                    label={sendLabel}
                    disabled={sendDisabled}
                  >
                    <SendIcon aria-hidden="true" />
                  </IconButton>
                )}
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </form>
      </section>
      {wide && computerOpen && (
        <aside
          id={panelId}
          aria-label={t("computerTitle")}
          className="flex w-72 min-w-0 shrink-0 flex-col border-l"
        >
          <ComputerPanel
            controller={computer}
            onClose={closeComputer}
            activity={activity ?? state.toolActivity}
            approvalPort={approvalPort}
            selection={{ spaceId: item.agent.spaceId, conversationId: item.conversation.id }}
          />
        </aside>
      )}
      {!wide && (
        <CapabilitySheet
          id={panelId}
          open={computerOpen}
          onClose={closeComputer}
          title={t("computerTitle")}
          closeLabel={t("computerClose")}
          finalFocus={computerFinalFocus}
          bodyClassName="p-0"
          // Keep the file surface inside the viewport during the sheet's opacity transition.
          className="max-w-[calc(100vw-3rem)] data-[side=right]:data-ending-style:translate-x-0 data-[side=right]:data-starting-style:translate-x-0"
        >
          <ComputerPanel
            sheet
            controller={computer}
            onClose={closeComputer}
            activity={activity ?? state.toolActivity}
            approvalPort={approvalPort}
            selection={{ spaceId: item.agent.spaceId, conversationId: item.conversation.id }}
          />
        </CapabilitySheet>
      )}
    </div>
  );
}

const wideQuery = "(min-width: 1280px)";
function subscribeWide(listener: () => void) {
  const media = window.matchMedia?.(wideQuery);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
function isWide() {
  return window.matchMedia?.(wideQuery).matches ?? false;
}

/** Visibility updates stay with the composer affordance, outside the transcript. */
function PendingApprovalControl({
  cards,
  history,
}: {
  cards: readonly ApprovalCardView[];
  history: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("agents");
  const requestId = cards[0]?.requestId;
  const [visible, setVisible] = useState<string | null>(null);
  useEffect(() => {
    if (!requestId || !history.current || typeof IntersectionObserver === "undefined") return;
    const node = document.getElementById(`approval-${requestId}`);
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting ? requestId : null);
      },
      { root: history.current },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [requestId, history]);
  if (!requestId || visible === requestId) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="mr-auto min-w-0 max-w-full shrink"
      aria-controls={`approval-${requestId}`}
      onClick={() => {
        const node = document.getElementById(`approval-${requestId}`);
        node?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
        node?.focus({ preventScroll: true });
      }}
    >
      <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {t("approval.pendingCount", { count: cards.length })}
      </span>
    </Button>
  );
}
