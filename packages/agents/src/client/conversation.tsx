import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { IconButton } from "@raypx/ui/icon-button";
import { HelpHint } from "@raypx/ui/help-hint";
import { RefreshIcon } from "@raypx/icons/refresh";
import { SendIcon } from "@raypx/icons/send";
import { StopIcon } from "@raypx/icons/stop";
import type { RunId } from "@raypx/core/conversation";
import {
  ConversationController,
  type AgentConversationView,
  type ConversationDraftStore,
  type ConversationSocketPort,
  type ConversationPort,
} from "../model.js";
import { useTranslations } from "./i18n.js";

const connectionKeys = {
  connecting: "connecting",
  live: "live",
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
      <p role="status" className="text-sm text-muted-foreground">
        {t("connecting")}
      </p>
    );
  return <ConversationContents item={item} controller={controller} />;
}

function ConversationContents({
  item,
  controller,
}: {
  item: AgentConversationView;
  controller: ConversationController;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [stopping, setStopping] = useState<RunId | null>(null);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const tail =
    state.liveReplies.at(-1)?.text ?? state.segments.at(-1)?.text ?? state.messages.at(-1)?.id;
  useEffect(() => {
    if (follow.current && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [tail, state.messages.length, state.segments.length]);
  const active = state.runs.filter((run) => run.state === "running" || run.state === "queued");
  const replying = state.liveReplies.length > 0;
  let announcement = "";
  if (replying) announcement = t("replying");
  else if (state.segments.length > 0) announcement = t("replyReady");
  const rows = [
    ...state.messages.map((message) => ({
      kind: "message" as const,
      sequence: message.sequence,
      message,
    })),
    ...state.segments.map((segment) => ({
      kind: "segment" as const,
      sequence: segment.sequence,
      segment,
    })),
  ].sort((left, right) => left.sequence - right.sequence);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void controller.send();
  }
  async function stop(runId: RunId) {
    if (stopping) return;
    setStopping(runId);
    try {
      await controller.stop(runId);
    } finally {
      setStopping(null);
    }
  }

  return (
    <section aria-label={t("conversation")} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 text-lg font-medium wrap-anywhere">{item.agent.name}</h2>
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs text-muted-foreground">
            {t(connectionKeys[state.connection])}
          </span>
          <IconButton label={t("refresh")} onClick={() => controller.reconnect()}>
            <RefreshIcon aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(errorKeys[state.error])}
        </p>
      )}
      <div
        ref={history}
        role="log"
        aria-live="off"
        aria-label={t("conversation")}
        className="flex max-h-[min(55dvh,48rem)] min-h-48 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain md:max-h-[min(65dvh,48rem)]"
        onScroll={() => {
          const node = history.current;
          if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
      >
        {rows.length === 0 && !state.loading && (
          <p className="text-sm text-muted-foreground">{t("emptyConversation")}</p>
        )}
        {rows.map((row) => {
          if (row.kind === "segment")
            return (
              <article key={row.segment.id} className="flex min-w-0 flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{item.agent.name}</h3>
                <p className="whitespace-pre-wrap text-sm wrap-anywhere">{row.segment.text}</p>
              </article>
            );
          const runs = state.runs.filter((run) => run.messageId === row.message.id);
          return (
            <article
              key={row.message.id}
              className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/50 p-3"
            >
              <h3 className="text-xs font-medium text-muted-foreground">{t("you")}</h3>
              <p className="whitespace-pre-wrap text-sm wrap-anywhere">{row.message.text}</p>
              {runs.map((run) => (
                <div key={run.id} className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(run.state)}</Badge>
                  {run.failureCode && (
                    <p className="text-xs text-muted-foreground wrap-anywhere">
                      {t(run.failureCode)}
                    </p>
                  )}
                  {run.state === "failed" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          state.pending !== null ||
                          (state.draft !== "" && state.draft !== row.message.text)
                        }
                        onClick={() => {
                          if (controller.prepareRetry(run.id)) editor.current?.focus();
                        }}
                      >
                        {t("retry")}
                      </Button>
                      {(state.pending !== null ||
                        (state.draft !== "" && state.draft !== row.message.text)) && (
                        <HelpHint label={t("retry")} description={t("retryDraftHint")} />
                      )}
                    </>
                  )}
                </div>
              ))}
            </article>
          );
        })}
        {state.liveReplies.map((reply) => (
          <article key={reply.segmentId} className="flex min-w-0 flex-col gap-2" aria-busy="true">
            <h3 className="text-xs font-medium text-muted-foreground">{item.agent.name}</h3>
            <p className="whitespace-pre-wrap text-sm wrap-anywhere">{reply.text}</p>
          </article>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {active.map((run) => (
          <div key={run.id} className="flex items-center gap-2">
            <Badge variant="secondary">{t(run.state)}</Badge>
            <IconButton
              label={t("stop")}
              disabled={stopping !== null}
              onClick={() => void stop(run.id)}
            >
              <StopIcon aria-hidden="true" />
            </IconButton>
          </div>
        ))}
      </div>
      {state.pending && !state.sending && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("pendingDelivery")}</p>
          <Button variant="outline" size="sm" onClick={() => void controller.sendPending()}>
            {t("retryDelivery")}
          </Button>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border p-3">
        <Field>
          <FieldLabel htmlFor={id} className="sr-only">
            {t("message")}
          </FieldLabel>
          <Textarea
            ref={editor}
            id={id}
            value={state.draft}
            rows={3}
            maxLength={32_000}
            placeholder={t("message")}
            onChange={(event) => controller.setDraft(event.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              state.sending ||
              !state.draft.trim() ||
              (state.pending !== null && state.pending.text !== state.draft)
            }
          >
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            {state.sending ? t("sending") : t("send")}
          </Button>
        </div>
      </form>
    </section>
  );
}
