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
import { Sheet, SheetContent } from "@raypx/ui/components/ui/sheet";
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
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { RefreshIcon } from "@raypx/icons/refresh";
import { SendIcon } from "@raypx/icons/send";
import { StopIcon } from "@raypx/icons/stop";
import type { RunId } from "@raypx/core/conversation";
import {
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
import { ComputerIndicator, ComputerPanel } from "./computer.js";
import { ApprovalCard, toolLabelKeys } from "./approval-card.js";
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
  item: AgentConversationView;
  port: ConversationPort;
  computerPort: ComputerPort;
  approvalPort?: ApprovalPort | undefined;
  activity?: readonly ApprovalCardView[] | undefined;
  onActivity?: ((spaceId: string, cards: readonly ApprovalCardView[]) => void) | undefined;
  socket: ConversationSocketPort;
  drafts: ConversationDraftStore;
  origin: string;
  accountId: string;
  /** Reserved for a conversation with multiple Agents; direct conversations omit names. */
  showAgentNames?: boolean;
  /** A mount may supply membership context when its data source exposes it. */
  hasOtherMembers?: boolean;
}

export function AgentConversation({
  item,
  port,
  computerPort,
  approvalPort,
  activity,
  onActivity,
  socket,
  drafts,
  origin,
  accountId,
  showAgentNames = false,
  hasOtherMembers = false,
}: AgentConversationProps) {
  const t = useTranslations("agents");
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
      computer = new ComputerController(item.agent.spaceId, computerPort);
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
      void next.start();
    });
    return () => {
      cancelled = true;
      next?.dispose();
      computer?.dispose();
    };
  }, [
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
      controller={controllers.conversation}
      computer={controllers.computer}
      accountId={accountId}
      showAgentNames={showAgentNames}
      hasOtherMembers={hasOtherMembers}
      approvalPort={approvalPort}
      activity={activity}
      onActivity={onActivity}
    />
  );
}

function ConversationContents({
  item,
  controller,
  computer,
  accountId,
  showAgentNames,
  hasOtherMembers,
  approvalPort,
  activity,
  onActivity,
}: {
  item: AgentConversationView;
  controller: ConversationController;
  computer: ComputerController;
  accountId: string;
  showAgentNames: boolean;
  hasOtherMembers: boolean;
  approvalPort: ApprovalPort | undefined;
  activity: readonly ApprovalCardView[] | undefined;
  onActivity: ((spaceId: string, cards: readonly ApprovalCardView[]) => void) | undefined;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const panelId = useId();
  const computerTrigger = useRef<HTMLButtonElement>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const computerState = useSyncExternalStore(
    computer.subscribe,
    computer.getSnapshot,
    computer.getSnapshot,
  );
  function closeComputer() {
    setComputerOpen(false);
    computerTrigger.current?.focus();
  }
  const editor = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const anchor = useRef<{ node: HTMLElement; offset: number } | null>(null);
  const composing = useRef(false);
  const [away, setAway] = useState(false);
  const [stopping, setStopping] = useState<RunId | null>(null);
  const [announcement, setAnnouncement] = useState({ revision: 0, text: "" });
  const observed = useRef(new Map<RunId, string>());
  const observedCards = useRef(new Map<string, string>());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { messages, runs, segments, liveReplies, cursor } = state;
  const rows = useMemo(
    () => conversationTimelineRows({ messages, runs, segments, liveReplies, cursor }, state.cards),
    [messages, runs, segments, liveReplies, cursor, state.cards],
  );
  const pendingCards = useMemo(
    () =>
      state.cards.filter(
        (card) =>
          card.state === "pending" &&
          card.memberAccountId === accountId &&
          card.error !== "resolvedElsewhere",
      ),
    [state.cards, accountId],
  );
  const senderContext = {
    showAgentNames,
    hasOtherMembers:
      hasOtherMembers || messages.some((message) => message.author.accountId !== accountId),
  };
  useEffect(() => {
    if (state.cards.length) onActivity?.(item.agent.spaceId, state.cards);
  }, [state.cards, onActivity, item.agent.spaceId]);
  const active = activeConversationRun(state.runs);
  const showStop = active !== undefined && !state.draft.trim();
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
    let next = "";
    for (const run of state.runs) {
      const previous = observed.current.get(run.id);
      observed.current.set(run.id, run.state);
      if (previous === run.state) continue;
      if (run.state === "running") next = t("replying");
      else if (run.state === "waiting") next = t("waiting");
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
        cardAnnouncements.push(t("approval.announced", { tool: t(toolLabelKeys[card.toolName]) }));
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
    else if (anchor.current?.node.isConnected) {
      const saved = anchor.current;
      node.scrollTop +=
        saved.node.getBoundingClientRect().top - node.getBoundingClientRect().top - saved.offset;
    }
  }, []);
  useLayoutEffect(restoreReading, [rows, restoreReading]);
  useLayoutEffect(() => {
    if (!content.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(restoreReading);
    observer.observe(content.current);
    if (history.current) observer.observe(history.current);
    return () => observer.disconnect();
  }, [restoreReading]);
  function trackReading() {
    const node = history.current;
    if (!node) return;
    follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    setAway(!follow.current);
    const top = node.getBoundingClientRect().top;
    const first = [...node.querySelectorAll<HTMLElement>("[data-message-row]")].find(
      (row) => row.getBoundingClientRect().bottom > top,
    );
    anchor.current = first
      ? { node: first, offset: first.getBoundingClientRect().top - top }
      : null;
  }
  function latest() {
    follow.current = true;
    anchor.current = null;
    setAway(false);
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
    if (stopping) return;
    setStopping(runId);
    try {
      await controller.stop(runId);
    } finally {
      setStopping(null);
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
          <header data-conversation-header className="flex min-w-0 flex-1 items-center gap-2">
            <h1
              ref={title}
              tabIndex={-1}
              title={item.agent.name}
              className="min-w-0 flex-1 truncate rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.agent.name}
            </h1>
            <div className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap @sm/main:flex-row @sm/main:items-center">
              <ComputerIndicator
                ref={computerTrigger}
                state={computerState}
                open={computerOpen}
                panelId={panelId}
                onOpen={() => {
                  if (computerOpen) closeComputer();
                  else setComputerOpen(true);
                }}
              />
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
            </div>
          </header>
        </ShellToolbar>
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
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={history}
            role="log"
            aria-live="off"
            aria-label={t("conversation")}
            tabIndex={0}
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [overflow-anchor:none]"
            onScroll={trackReading}
          >
            <div ref={content} className="flex min-h-full min-w-0 flex-col gap-2 pb-2">
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
                      key={row.id}
                      runId={row.runId}
                      cards={row.cards}
                      accountId={accountId}
                    />
                  );
                if (row.kind === "approval")
                  return (
                    <ApprovalCard
                      key={row.id}
                      card={row.card}
                      accountId={accountId}
                      onAnswer={(decision, allowTool) =>
                        controller.answerApproval(row.card.requestId, decision, allowTool)
                      }
                      onExpired={() => void controller.refreshApprovals()}
                      onAnswered={() => editor.current?.focus()}
                    />
                  );
                const showSender = conversationSenderVisible(
                  row.kind,
                  senderContext,
                  index > 0 && rows[index - 1]?.sender === row.sender,
                );
                if (row.kind === "member")
                  return (
                    <article
                      key={row.id}
                      data-message-row={row.id}
                      className={cn(
                        "flex min-w-0 flex-col items-end gap-1 pl-6",
                        index > 0 && rows[index - 1]?.kind !== "member" && "mt-4",
                      )}
                    >
                      {showSender && (
                        <h3 className="text-xs font-medium text-muted-foreground">
                          {row.sender === `member:${accountId}` ? t("you") : t("member")}
                        </h3>
                      )}
                      <p className="max-w-[90%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere">
                        {row.text}
                      </p>
                    </article>
                  );
                const run = row.run;
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
                    data-message-row={row.id}
                    aria-busy={producing}
                    className="flex min-w-0 flex-col pr-6"
                  >
                    <div className="flex w-fit min-w-0 max-w-[90%] flex-col gap-2">
                      {showSender && (
                        <h3
                          title={item.agent.name}
                          className="min-w-0 truncate text-xs font-medium"
                        >
                          {item.agent.name}
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
                            <span className={row.text ? "mt-2" : undefined}>
                              {run.state === "running" ? t("replying") : t(run.state)}
                            </span>
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
                    </div>
                  </article>
                );
              })}
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
        <form onSubmit={submit} className="min-w-0 shrink-0">
          <Field>
            <FieldLabel htmlFor={id} className="sr-only">
              {t("message")}
            </FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                ref={editor}
                id={id}
                value={state.draft}
                rows={1}
                maxLength={32_000}
                placeholder={t("message")}
                className="max-h-48 min-h-16 overflow-y-auto"
                onChange={(event) => controller.setDraft(event.target.value)}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onKeyDown={(event) => {
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
              <InputGroupAddon align="block-end" className="justify-end">
                <PendingApprovalControl cards={pendingCards} history={history} />
                {showStop && active ? (
                  <IconButton
                    variant="default"
                    label={t("stop")}
                    disabled={stopping !== null}
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
            activity={activity ?? state.cards}
          />
        </aside>
      )}
      {!wide && (
        <Sheet
          open={computerOpen}
          onOpenChange={(open) => {
            if (!open) closeComputer();
          }}
        >
          <SheetContent
            id={panelId}
            showCloseButton={false}
            finalFocus={computerTrigger}
            className="max-w-[calc(100vw-3rem)] motion-reduce:transform-none motion-reduce:transition-none"
          >
            <ComputerPanel
              sheet
              controller={computer}
              onClose={closeComputer}
              activity={activity ?? state.cards}
            />
          </SheetContent>
        </Sheet>
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
