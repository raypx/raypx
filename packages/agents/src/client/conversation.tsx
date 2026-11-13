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
  activeConversationRun,
  conversationRows,
  type AgentConversationView,
  type ConversationDraftStore,
  type ConversationSocketPort,
  type ConversationPort,
} from "../model.js";
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
  socket: ConversationSocketPort;
  drafts: ConversationDraftStore;
  origin: string;
  accountId: string;
}

export function AgentConversation({
  item,
  port,
  socket,
  drafts,
  origin,
  accountId,
}: AgentConversationProps) {
  const t = useTranslations("agents");
  const [controller, setController] = useState<ConversationController | null>(null);
  useEffect(() => {
    let cancelled = false;
    let next: ConversationController | undefined;
    queueMicrotask(() => {
      if (cancelled) return;
      next = new ConversationController({
        selection: { spaceId: item.agent.spaceId, conversationId: item.conversation.id },
        owner: { origin, accountId },
        port,
        socket,
        drafts,
        key: () => crypto.randomUUID(),
      });
      setController(next);
      void next.start();
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [item.agent.spaceId, item.conversation.id, origin, accountId, port, socket, drafts]);
  if (!controller)
    return (
      <Empty role="status">
        <EmptyTitle>{t("loading")}</EmptyTitle>
      </Empty>
    );
  return <ConversationContents item={item} controller={controller} accountId={accountId} />;
}

function ConversationContents({
  item,
  controller,
  accountId,
}: {
  item: AgentConversationView;
  controller: ConversationController;
  accountId: string;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const anchor = useRef<{ node: HTMLElement; offset: number } | null>(null);
  const composing = useRef(false);
  const [away, setAway] = useState(false);
  const [stopping, setStopping] = useState<RunId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const observed = useRef(new Map<RunId, string>());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { messages, runs, segments, liveReplies, cursor } = state;
  const rows = useMemo(
    () => conversationRows({ messages, runs, segments, liveReplies, cursor }),
    [messages, runs, segments, liveReplies, cursor],
  );
  const active = activeConversationRun(state.runs);
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
      else if (previous === "running" || previous === "queued") {
        if (run.state === "succeeded") next = t("replyReady");
        if (run.state === "failed") next = t("failed");
        if (run.state === "cancelled") next = t("cancelled");
      }
    }
    if (next) queueMicrotask(() => setAnnouncement(next));
  }, [state.runs, t]);

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
    if (active || sendDisabled) return;
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
    <section
      aria-label={t("conversation")}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden"
    >
      <header className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b pb-3">
        <h2
          ref={title}
          tabIndex={-1}
          title={item.agent.name}
          className="min-w-0 truncate rounded-md text-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.agent.name}
        </h2>
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
      </header>
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
          <div ref={content} className="flex min-h-full min-w-0 flex-col gap-4 pb-4">
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
              const showSender = index === 0 || rows[index - 1]?.sender !== row.sender;
              if (row.kind === "member")
                return (
                  <article
                    key={row.id}
                    data-message-row={row.id}
                    className="flex min-w-0 flex-col items-end gap-1 pl-6"
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
              const retryMessage = state.messages.find((message) => message.id === run?.messageId);
              const retryDisabled =
                state.pending !== null ||
                (state.draft !== "" && state.draft !== retryMessage?.text);
              return (
                <article
                  key={row.id}
                  data-message-row={row.id}
                  aria-busy={producing}
                  className="flex min-w-0 flex-col gap-2 pr-6"
                >
                  {showSender && (
                    <h3 title={item.agent.name} className="truncate text-xs font-medium">
                      {item.agent.name}
                    </h3>
                  )}
                  <div className="min-w-0 rounded-lg border px-3 py-3 text-sm">
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
                        {run.state === "failed" && retryMessage && (
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
                              <HelpHint label={t("retry")} description={t("retryDraftHint")} />
                            )}
                          </>
                        )}
                      </div>
                    )}
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
        {announcement}
      </p>
      {state.pending && !state.sending && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("pendingDelivery")}</p>
          <Button variant="outline" size="sm" onClick={() => void retryDelivery()}>
            {t("retryDelivery")}
          </Button>
        </div>
      )}
      <form onSubmit={submit} className="shrink-0">
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
              {active ? (
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
                  label={state.sending ? t("sending") : t("send")}
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
  );
}
