import { AttachmentDrafts, MessageAttachments, useAttachmentFiles } from "./attachments.js";
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
} from "react";
import { ShellToolbar } from "@raypx/blocks/shell";
import { cn } from "@raypx/ui/lib/utils";
import { ReplyMarkdown } from "@raypx/blocks/markdown";
import { Button } from "@raypx/ui/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@raypx/ui/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { InputGroupTextarea } from "@raypx/ui/components/ui/input-group";
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia } from "@raypx/ui/components/ui/empty";
import { Alert, AlertDescription, AlertAction } from "@raypx/ui/components/ui/alert";
import { IconButton } from "@raypx/ui/icon-button";
import { HelpHint } from "@raypx/ui/help-hint";
import { PlusIcon } from "@raypx/icons/plus";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { MonitorIcon } from "@raypx/icons/monitor";
import { MoreHorizontalIcon } from "@raypx/icons/more-horizontal";
import { SettingsIcon } from "@raypx/icons/settings";
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
import { DeviceComputersController } from "../model/device-computers.js";
import { ApprovalCard } from "./approval-card.js";
import { ProtectedInputs } from "./protected-input.js";
import { ComposerCard } from "./composer-card.js";
import { ReplyActions } from "./reply-actions.js";
import { ComputerFiles } from "./computer-files.js";
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
  supportsImages?: boolean | undefined;
  onBack?: (() => void) | undefined;
  onEditAgent?: (() => void) | undefined;
  onDeleteAgent?: (() => void) | undefined;
  onLastActivity?: ((at: string, conversationId: string) => void) | undefined;
  onOpenPage?: ((id: string) => void) | undefined;
  composerReference?: { id: string; text: string } | undefined;
  runReference?: { id: string; runId: string } | undefined;
  group?: GroupConversationView | undefined;
  agentDirectory?: readonly Agent[] | undefined;
  onManageParticipants?: (() => void) | undefined;
  capabilities?:
    | Pick<
        AgentsWorkspacePort,
        | "routines"
        | "spaceMemory"
        | "deviceComputers"
        | "protectedInputs"
        | "messageAttachments"
        | "notifications"
      >
    | undefined;
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
  supportsImages,
  onBack,
  onEditAgent,
  onDeleteAgent,
  onLastActivity,
  onOpenPage,
  composerReference,
  runReference,
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
        ...(capabilities?.messageAttachments
          ? { attachments: capabilities.messageAttachments }
          : {}),
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
    capabilities?.messageAttachments,
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
      onBack={onBack}
      onEditAgent={onEditAgent}
      onDeleteAgent={onDeleteAgent}
      onOpenPage={onOpenPage}
      onLastActivity={onLastActivity}
      runReference={runReference}
      group={group}
      agentDirectory={agentDirectory}
      onManageParticipants={onManageParticipants}
      capabilities={capabilities}
      supportsImages={supportsImages}
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
  supportsImages,
  runReference,
  onBack,
  onEditAgent,
  onDeleteAgent,
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
  runReference: { id: string; runId: string } | undefined;
  onBack: (() => void) | undefined;
  onEditAgent: (() => void) | undefined;
  onDeleteAgent: (() => void) | undefined;
  onLastActivity: ((at: string, conversationId: string) => void) | undefined;
  onOpenPage: ((id: string) => void) | undefined;
  item: AgentConversationView;
  group: GroupConversationView | undefined;
  agentDirectory: readonly Agent[] | undefined;
  onManageParticipants: (() => void) | undefined;
  capabilities:
    | Pick<
        AgentsWorkspacePort,
        | "routines"
        | "spaceMemory"
        | "deviceComputers"
        | "protectedInputs"
        | "messageAttachments"
        | "notifications"
      >
    | undefined;
  origin: string;
  supportsImages: boolean | undefined;
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
  useEffect(() => {
    const port = capabilities?.notifications;
    if (!port) return;
    const viewed = () => {
      if (!document.hidden)
        void port
          .viewed({ spaceId: item.agent.spaceId, conversationId: item.conversation.id })
          .catch(() => {});
    };
    viewed();
    const timer = setInterval(viewed, 15_000);
    document.addEventListener("visibilitychange", viewed);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", viewed);
    };
  }, [capabilities?.notifications, item.agent.spaceId, item.conversation.id]);
  const panelId = useId();
  const attachmentFiles = useAttachmentFiles(controller.attachments, supportsImages === true);
  const computerTrigger = useRef<HTMLButtonElement>(null);
  const capabilityMenuTrigger = useRef<HTMLButtonElement>(null);
  const computerMenuOpener = useRef<HTMLButtonElement | null>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [capabilityTarget, setCapabilityTarget] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<"conversation" | "activity" | "files">("conversation");
  const replyElements = useRef(new Map<string, HTMLElement>());
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const computerState = useSyncExternalStore(
    computer.subscribe,
    computer.getSnapshot,
    computer.getSnapshot,
  );
  const devices = useMemo(
    () =>
      capabilities?.deviceComputers
        ? new DeviceComputersController(
            item.agent.spaceId,
            capabilities.deviceComputers,
            item.conversation.id,
          )
        : null,
    [capabilities?.deviceComputers, item.agent.spaceId, item.conversation.id],
  );
  const deviceState = useSyncExternalStore(
    devices?.subscribe ?? subscribeNoDevices,
    devices?.getSnapshot ?? noDevices,
    devices?.getSnapshot ?? noDevices,
  );
  useEffect(() => {
    if (!devices) return;
    void devices.refresh();
    return () => devices.dispose();
  }, [devices]);
  const selectedDevice = deviceState?.devices.find(
    (device) => device.id === deviceState.selection?.deviceId,
  );
  const deviceSelectionKnown = !deviceState || (!deviceState.loading && !deviceState.error);
  let computerStatus = t(computerStatusKey(computerState.status));
  if (deviceState?.selection)
    computerStatus = `${selectedDevice?.name ?? t("devices.unavailable")} · ${t(selectedDevice?.connected ? "devices.connected" : "devices.offline")}`;
  else if (deviceState?.loading) computerStatus = t("loading");
  else if (deviceState?.error) computerStatus = t("computerUnavailable");
  function openComputer(opener: HTMLButtonElement | null = computerTrigger.current) {
    computerMenuOpener.current = opener === computerTrigger.current ? null : opener;
    if (wide) setContextOpen(true);
    setComputerOpen(true);
    onComputerOpen?.();
  }
  function computerFinalFocus() {
    if (computerMenuOpener.current) return computerMenuOpener.current;
    return computerTrigger.current ?? false;
  }
  function closeComputer() {
    setComputerOpen(false);
    if (wide) {
      setContextOpen(false);
      computerTrigger.current?.focus();
    }
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
    setTab("conversation");
    setTargetRun(runId);
    void controller.loadRun(runId as RunId);
  }
  useEffect(() => {
    if (!runReference || state.loading) return;
    let cancelled = false;
    void controller.loadRun(runReference.runId as RunId).then(() => {
      if (cancelled) return;
      setTab("conversation");
      setTargetRun(runReference.runId);
    });
    return () => {
      cancelled = true;
    };
  }, [runReference, controller, state.loading]);
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
  function statusForRun(run: (typeof state.runs)[number] | undefined) {
    if (!run || run.state === "succeeded") return undefined;
    if (run.computerInputPaused) return t("screen.agentPaused");
    const waitingOnWork =
      delegatedWork(state, run.id).some((child) =>
        ["queued", "running", "waiting"].includes(child.run.state),
      ) &&
      state.toolActivity.some(
        (call) => call.runId === run.id && call.toolName === "agent_wait" && call.outcome === null,
      );
    if (waitingOnWork) return t("delegation.waiting");
    return t(run.state === "running" ? "replying" : run.state);
  }
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
    (!state.draft.trim() && !attachmentFiles.items.some((draft) => draft.state === "ready")) ||
    attachmentFiles.items.some((draft) => draft.state !== "ready") ||
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
    <Tabs
      onDropCapture={attachmentFiles.onDrop}
      onDragOverCapture={attachmentFiles.onDragOver}
      value={tab}
      onValueChange={(value) => {
        if (value === "conversation" || value === "activity" || value === "files") setTab(value);
      }}
      className="min-h-0 min-w-0 flex-1 flex-row gap-6 overflow-clip data-[orientation=horizontal]:flex-row"
    >
      <section
        aria-label={t("conversation")}
        className="flex min-h-0 w-0 min-w-0 flex-1 flex-col gap-3 overflow-clip"
      >
        <ShellToolbar>
          <header
            data-conversation-header
            className="grid w-full min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 py-2 sm:flex sm:flex-nowrap"
          >
            {onBack && (
              <IconButton
                size="icon-sm"
                label={t("back")}
                className="col-start-1 row-start-1 shrink-0 sm:hidden"
                onClick={onBack}
              >
                <ArrowLeftIcon aria-hidden="true" />
              </IconButton>
            )}
            <h1
              ref={title}
              tabIndex={-1}
              title={conversationName}
              className={cn(
                "col-start-2 row-start-1 min-w-0 flex-1 truncate text-sm font-medium text-foreground outline-none focus-visible:underline focus-visible:decoration-muted-foreground focus-visible:underline-offset-4 sm:max-w-72",
                !onBack && "col-span-2 col-start-1",
              )}
            >
              {conversationName}
            </h1>
            <TabsList
              variant="line"
              aria-label={t("conversationViews")}
              className="col-span-3 row-start-2 w-full min-w-0 flex-nowrap justify-start gap-3 p-0 sm:mr-auto sm:w-auto"
            >
              <TabsTrigger value="conversation">{t("conversation")}</TabsTrigger>
              <TabsTrigger value="activity">{t("activity.title")}</TabsTrigger>
              <TabsTrigger value="files">{t("files.title")}</TabsTrigger>
            </TabsList>
            <div
              data-conversation-actions
              className="col-start-3 row-start-1 flex shrink-0 flex-row flex-nowrap items-center gap-1 whitespace-nowrap"
            >
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
                  workspace
                  contextTarget={capabilityTarget}
                  onEditAgent={onEditAgent}
                  onDeleteAgent={onDeleteAgent}
                />
              )}
              {!capabilities && onEditAgent && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<IconButton size="icon-sm" label={t("conversationActions")} />}
                  >
                    <MoreHorizontalIcon aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={onEditAgent}>{t("editAgent")}</DropdownMenuItem>
                      {onDeleteAgent && (
                        <DropdownMenuItem variant="destructive" onClick={onDeleteAgent}>
                          {t("deleteAgent")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <ComputerIndicator
                compact
                ref={computerTrigger}
                state={computerState}
                statusLabel={computerStatus}
                deviceName={
                  deviceState?.selection
                    ? (selectedDevice?.name ?? t("devices.unavailable"))
                    : undefined
                }
                deviceConnected={selectedDevice?.connected}
                open={wide ? contextOpen : computerOpen}
                panelId={panelId}
                onOpen={() => {
                  if (wide ? contextOpen : computerOpen) closeComputer();
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
        <TabsContent
          value="conversation"
          keepMounted
          className="relative flex min-h-0 min-w-0 flex-1 flex-col data-hidden:hidden"
        >
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
            <div
              ref={content}
              className="mx-auto flex min-h-full w-full min-w-0 max-w-[44rem] flex-col gap-4 px-1 pt-4 pb-6 sm:px-3"
            >
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
                if (row.kind === "activity") {
                  const work = delegatedWork(state, row.runId);
                  return (
                    <ToolActivity
                      onOpenPage={onOpenPage}
                      key={row.id}
                      runId={row.runId}
                      runStatus={statusForRun(state.runs.find((run) => run.id === row.runId))}
                      activity={row.activity}
                      pendingCount={row.pendingCount}
                      additionalCount={work.length}
                      approvalPort={approvalPort}
                      answers={state.cards}
                      memberName={senderContext.hasOtherMembers ? memberName : undefined}
                      selection={{
                        spaceId: item.agent.spaceId,
                        conversationId: item.conversation.id,
                      }}
                    >
                      <DelegatedWork
                        work={work}
                        parentRunId={row.runId}
                        agentName={group ? agentName : undefined}
                        answers={state.cards}
                        approvalPort={approvalPort}
                        selection={{
                          spaceId: item.agent.spaceId,
                          conversationId: item.conversation.id,
                        }}
                        memberName={senderContext.hasOtherMembers ? memberName : undefined}
                      />
                    </ToolActivity>
                  );
                }
                if (row.kind === "approval") return null;
                const showSender = visibleSenders.has(row.id);
                if (row.kind === "member" && row.agentId)
                  return (
                    <article
                      key={row.id}
                      data-message-row={row.id}
                      data-message-id={row.id.startsWith("message:") ? row.id.slice(8) : row.id}
                      data-agent-message={row.agentId}
                      className="flex min-w-0 flex-col gap-1"
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
                      <p className="text-[15px] leading-7 whitespace-pre-wrap wrap-anywhere">
                        {row.text}
                      </p>
                      <MessageAttachments
                        attachments={row.attachments}
                        port={capabilities?.messageAttachments}
                        selection={{
                          spaceId: item.agent.spaceId,
                          conversationId: item.conversation.id,
                        }}
                      />
                    </article>
                  );
                if (row.kind === "member")
                  return (
                    <article
                      key={row.id}
                      data-message-row={row.id}
                      data-message-id={row.id.startsWith("message:") ? row.id.slice(8) : row.id}
                      className={cn(
                        "flex min-w-0 flex-col items-end gap-1 pl-8",
                        index > 0 && rows[index - 1]?.kind !== "member" && "mt-4",
                      )}
                    >
                      {showSender && (
                        <h3 className="text-xs font-medium text-muted-foreground">
                          {memberName(row.sender.slice("member:".length))}
                        </h3>
                      )}
                      <p className="max-w-[90%] rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap wrap-anywhere">
                        {row.text}
                      </p>
                      <MessageAttachments
                        attachments={row.attachments}
                        port={capabilities?.messageAttachments}
                        selection={{
                          spaceId: item.agent.spaceId,
                          conversationId: item.conversation.id,
                        }}
                      />
                    </article>
                  );
                const run = row.run;
                const work = run ? delegatedWork(state, run.id) : [];
                const hasSteps =
                  work.length > 0 ||
                  rows.some((entry) => entry.kind === "activity" && entry.runId === run?.id);
                const producing = run?.state === "running" || run?.state === "queued";
                const retryMessage = state.messages.find(
                  (message) => message.id === run?.messageId,
                );
                const retryDisabled =
                  state.pending !== null ||
                  (state.draft !== "" && state.draft !== retryMessage?.text);
                return (
                  <article
                    key={row.id}
                    ref={(node) => {
                      if (node) replyElements.current.set(row.id, node);
                      else replyElements.current.delete(row.id);
                    }}
                    data-message-row={row.id}
                    data-run-id={run?.id}
                    tabIndex={-1}
                    aria-busy={producing}
                    className="flex min-w-0 flex-col"
                  >
                    <div className="flex w-full min-w-0 flex-col gap-2">
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
                      <div data-reply-bubble className="min-w-0 text-[15px] leading-7 sm:text-base">
                        {row.text && (
                          <ReplyMarkdown
                            copyLabel={t("copyCode")}
                            copiedLabel={t("codeCopied")}
                            copyErrorLabel={t("copyCodeError")}
                          >
                            {row.text}
                          </ReplyMarkdown>
                        )}
                        {run && run.state !== "succeeded" && (!hasSteps || run.failureCode) && (
                          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {!hasSteps && (
                              <span className={row.text ? "mt-2" : undefined}>
                                {statusForRun(run)}
                              </span>
                            )}
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
                      {row.text && run && (
                        <ReplyActions
                          text={row.text}
                          getArticle={() => replyElements.current.get(row.id) ?? null}
                          retryDisabled={retryDisabled}
                          onRetry={
                            !group && run.state === "succeeded" && retryMessage
                              ? () => {
                                  controller.setDraft(retryMessage.text);
                                  editor.current?.focus();
                                }
                              : undefined
                          }
                          onSteer={
                            ["queued", "running", "waiting"].includes(run.state)
                              ? () => {
                                  controller.beginSteering(run.id);
                                  editor.current?.focus();
                                }
                              : undefined
                          }
                          onActivity={() => setTab("activity")}
                        />
                      )}
                      {run &&
                        work.length > 0 &&
                        !rows.some(
                          (entry) => entry.kind === "activity" && entry.runId === run.id,
                        ) && (
                          <ToolActivity
                            runId={run.id}
                            runStatus={statusForRun(run)}
                            activity={[]}
                            additionalCount={work.length}
                          >
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
                          </ToolActivity>
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
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
              <Button
                size="sm"
                variant="secondary"
                className="pointer-events-auto shadow-sm"
                onClick={latest}
              >
                <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
                {t("latest")}
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent
          value="activity"
          className="min-h-0 min-w-0 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex w-full min-w-0 max-w-[44rem] flex-col gap-6 px-1 py-5 sm:px-3">
            {state.toolActivityTruncated && (
              <p className="text-xs text-muted-foreground">{t("activity.truncated")}</p>
            )}
            {rows.filter((row) => row.kind === "activity").length === 0 &&
              !runs.some((run) => !run.parentRunId && !run.outsideWindow) && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{t("activity.empty")}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            {rows.map((row) => {
              if (row.kind !== "activity") return null;
              const run = state.runs.find((entry) => entry.id === row.runId);
              return (
                <section
                  key={row.id}
                  data-run-id={row.runId}
                  className="flex min-w-0 flex-col gap-2"
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">{agentName(run?.agentId)}</span>
                  </div>
                  <ToolActivity
                    runId={row.runId}
                    runStatus={statusForRun(run) ?? (run ? t("replyReady") : undefined)}
                    activity={row.activity}
                    pendingCount={row.pendingCount}
                    defaultExpanded
                    approvalPort={approvalPort}
                    answers={state.cards}
                    memberName={senderContext.hasOtherMembers ? memberName : undefined}
                    selection={{
                      spaceId: item.agent.spaceId,
                      conversationId: item.conversation.id,
                    }}
                    onOpenPage={onOpenPage}
                  >
                    <DelegatedWork
                      work={delegatedWork(state, row.runId)}
                      parentRunId={row.runId}
                      agentName={group ? agentName : undefined}
                      answers={state.cards}
                      approvalPort={approvalPort}
                      selection={{
                        spaceId: item.agent.spaceId,
                        conversationId: item.conversation.id,
                      }}
                      memberName={senderContext.hasOtherMembers ? memberName : undefined}
                    />
                  </ToolActivity>
                </section>
              );
            })}
            {runs
              .filter(
                (run) =>
                  !run.parentRunId &&
                  !rows.some((row) => row.kind === "activity" && row.runId === run.id),
              )
              .map((run) => {
                const work = delegatedWork(state, run.id);
                if (run.outsideWindow) return null;
                return (
                  <section
                    key={run.id}
                    data-run-id={run.id}
                    className="flex min-w-0 flex-col gap-2"
                  >
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">{agentName(run.agentId)}</span>
                      {work.length === 0 && <span>{statusForRun(run) ?? t("replyReady")}</span>}
                    </div>
                    {run.failureCode && (
                      <p className="text-sm text-muted-foreground">{t(run.failureCode)}</p>
                    )}
                    <ToolActivity
                      runId={run.id}
                      runStatus={statusForRun(run)}
                      activity={[]}
                      additionalCount={work.length}
                      defaultExpanded
                    >
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
                    </ToolActivity>
                  </section>
                );
              })}
          </div>
        </TabsContent>
        <TabsContent value="files" className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full min-w-0 max-w-[44rem] px-1 py-5 sm:px-3">
            <h2 className="mb-3 text-sm font-medium">
              {deviceState?.selection
                ? (selectedDevice?.name ?? t("files.deviceTitle"))
                : t("devices.teamSandbox")}
            </h2>
            {computer.files ? (
              <ComputerFiles
                controller={computer.files}
                device={deviceState?.selection}
                status={computerState.status}
                refreshKey={state.toolActivity
                  .filter((call) => call.finishedAt)
                  .map((call) => `${call.runId}:${call.toolCallId}:${call.finishedAt}`)
                  .join("|")}
              />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("files.notConfigured")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </TabsContent>
        <div className="mx-auto flex w-full min-w-0 max-w-[44rem] shrink-0 flex-col gap-2 px-1 pb-3 sm:px-3 sm:pb-4">
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
                <div
                  key={run.id}
                  data-active-run-id={run.id}
                  className="min-w-0 space-y-2 px-3 py-2"
                >
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
          {pendingCards.filter((card) => !outsideRuns.some((run) => run.id === card.runId)).length >
            0 && (
            <div
              data-pending-approvals
              className="flex max-h-[min(18rem,30dvh)] min-w-0 shrink-0 flex-col gap-2 overflow-y-auto"
            >
              {pendingCards
                .filter((card) => !outsideRuns.some((run) => run.id === card.runId))
                .map((card) => {
                  const asking = runs.find((run) => run.id === card.runId);
                  return (
                    <ApprovalCard
                      key={card.requestId}
                      card={card}
                      accountId={accountId}
                      agentName={group ? agentName(asking?.agentId) : undefined}
                      taskSummary={asking?.parentRunId ? t("delegation.task") : undefined}
                      memberName={memberName}
                      onAnswer={(decision, allowTool) =>
                        controller.answerApproval(card.requestId, decision, allowTool)
                      }
                      onExpired={() => void controller.refreshApprovals()}
                      onAnswered={() => editor.current?.focus()}
                    />
                  );
                })}
            </div>
          )}
          {capabilities?.protectedInputs && (
            <ProtectedInputs
              port={capabilities.protectedInputs}
              spaceId={item.agent.spaceId}
              conversationId={item.conversation.id}
            />
          )}
          <form
            onSubmit={submit}
            onPasteCapture={attachmentFiles.onPaste}
            onDragOverCapture={attachmentFiles.onDragOver}
            onDropCapture={attachmentFiles.onDrop}
            className="min-w-0 shrink-0"
          >
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

              <ComposerCard
                attachments={
                  <AttachmentDrafts
                    controller={controller.attachments}
                    files={attachmentFiles}
                    disabled={state.sending || state.pending !== null}
                  />
                }
                toolbar={
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<IconButton size="icon-sm" label={t("addContext")} />}
                      >
                        <PlusIcon aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            disabled={
                              !controller.attachments || state.sending || state.pending !== null
                            }
                            onClick={() => attachmentFiles.choose()}
                          >
                            {t("attachments.add")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              !controller.attachments ||
                              supportsImages !== true ||
                              state.sending ||
                              state.pending !== null
                            }
                            onClick={() => attachmentFiles.choose(true)}
                          >
                            {t("attachments.images")}
                            {supportsImages !== true
                              ? ` — ${t("attachments.imagesUnavailable")}`
                              : ""}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setTab("files")}>
                            {t("files.title")}
                          </DropdownMenuItem>
                          {onOpenPage && (
                            <DropdownMenuItem onClick={() => onOpenPage("")}>
                              {t("pagesContext")}
                            </DropdownMenuItem>
                          )}
                          {onEditAgent && (
                            <DropdownMenuItem onClick={onEditAgent}>
                              {t("editAgent")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="flex min-w-0 max-w-full items-center gap-0.5 rounded-full bg-muted/70 px-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="max-w-28 rounded-full"
                        onClick={() => {
                          if (group) onManageParticipants?.();
                          else onEditAgent?.();
                        }}
                        disabled={group ? !onManageParticipants : !onEditAgent}
                      >
                        <AgentIcon data-icon="inline-start" aria-hidden="true" />
                        <span className="truncate">{conversationName}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        aria-label={t("composerComputer", {
                          state: computerStatus,
                        })}
                        title={computerStatus}
                        disabled={
                          deviceState?.busy ||
                          (deviceSelectionKnown &&
                            !deviceState?.selection &&
                            (computerState.pending !== null ||
                              computerState.refreshing ||
                              computerState.status === "loading" ||
                              computerState.status === "starting" ||
                              computerState.status === "stopping"))
                        }
                        onClick={() => {
                          if (
                            deviceSelectionKnown &&
                            !deviceState?.selection &&
                            ["stopped", "destroyed", "failed"].includes(computerState.status)
                          )
                            void computer.start();
                          else
                            openComputer(
                              editor.current
                                ?.closest("form")
                                ?.querySelector<HTMLButtonElement>("[data-composer-computer]") ??
                                null,
                            );
                        }}
                        data-composer-computer
                      >
                        <MonitorIcon data-icon="inline-start" aria-hidden="true" />
                        <span className="hidden lg:inline">{t("computerShort")}</span>
                      </Button>
                    </div>
                    <div className="ml-auto flex min-w-0 items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="max-w-28"
                              aria-label={t("modelAndApproval")}
                            />
                          }
                        >
                          <span className="truncate">{item.agent.model.modelId}</span>
                          <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-w-72">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>
                              {t("model")}: {item.agent.model.modelId}
                            </DropdownMenuLabel>
                            {appliedMode && (
                              <DropdownMenuLabel>
                                {t(
                                  modeSource !== "account_default"
                                    ? "spaceSettings.overridesDefault"
                                    : "spaceSettings.followsDefault",
                                )}
                                : {t(`approvalSettings.${appliedMode}`)}
                              </DropdownMenuLabel>
                            )}
                            {onEditAgent && (
                              <DropdownMenuItem onClick={onEditAgent}>
                                <SettingsIcon aria-hidden="true" />
                                {t("editAgent")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {showStop && active ? (
                        <IconButton
                          variant="default"
                          className="rounded-full"
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
                          className="rounded-full"
                          label={sendLabel}
                          disabled={sendDisabled}
                        >
                          <SendIcon aria-hidden="true" />
                        </IconButton>
                      )}
                    </div>
                  </>
                }
              >
                <InputGroupTextarea
                  ref={editor}
                  id={id}
                  value={state.draft}
                  rows={1}
                  maxLength={32_000}
                  placeholder={t("message")}
                  className="max-h-48 min-h-20 overflow-y-auto px-4 pt-4 pb-2"
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
              </ComposerCard>
              {group &&
                state.draft.trim() &&
                mentionIds(state.mentionTokens ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("mentions.noReply")}</p>
                )}
            </Field>
          </form>
        </div>
      </section>
      {wide && contextOpen && (
        <aside
          id={panelId}
          aria-label={t("computerTitle")}
          className="flex w-64 min-w-0 shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto py-4 pr-2"
        >
          <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border/60 bg-background">
            <ComputerPanel
              compact
              focusOnMount={computerOpen}
              showFiles={false}
              showActivity={false}
              controller={computer}
              devices={devices}
              deviceSelected={!!deviceState?.selection}
              onClose={closeComputer}
              activity={activity ?? state.toolActivity}
              approvalPort={approvalPort}
              selection={{ spaceId: item.agent.spaceId, conversationId: item.conversation.id }}
            />
          </div>
          <div ref={setCapabilityTarget} />
          {pendingCards.length > 0 && (
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 p-3">
              <h2 className="text-xs font-medium text-muted-foreground">
                {t("approval.states.pending")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTab("conversation");
                  document.getElementById(`approval-${pendingCards[0]?.requestId}`)?.focus();
                }}
              >
                {t("approval.pendingCount", { count: pendingCards.length })}
              </Button>
            </div>
          )}
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
            showFiles={tab !== "files"}
            controller={computer}
            devices={devices}
            deviceSelected={!!deviceState?.selection}
            onClose={closeComputer}
            activity={activity ?? state.toolActivity}
            approvalPort={approvalPort}
            selection={{ spaceId: item.agent.spaceId, conversationId: item.conversation.id }}
          />
        </CapabilitySheet>
      )}
    </Tabs>
  );
}

function computerStatusKey(status: ReturnType<ComputerController["getSnapshot"]>["status"]) {
  const keys = {
    loading: "loading",
    "not-configured": "computerNotConfigured",
    stopped: "computerStopped",
    destroyed: "computerStopped",
    starting: "computerStarting",
    running: "computerRunning",
    stopping: "computerStopping",
    failed: "computerFailed",
  } as const;
  return keys[status];
}

const wideQuery = "(min-width: 1280px)";
function subscribeNoDevices() {
  return () => {};
}
function noDevices() {
  return null;
}
function subscribeWide(listener: () => void) {
  const media = window.matchMedia?.(wideQuery);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
function isWide() {
  return window.matchMedia?.(wideQuery).matches ?? false;
}
