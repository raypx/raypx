import { agentProviderMetadata } from "@raypx/core/tasks";
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Bounded read-only scroll regions need keyboard focus for scrolling. */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";

import type { AgentTask, TaskActivity } from "@raypx/core/tasks";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { TaskMarkdown } from "./markdown.js";
import { ShimmerText } from "./shimmer-text.js";
import { ToolActivityRow } from "./tool-activity.js";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";

type Gap = { id: number; before: number; after: number };
type Props = {
  task: AgentTask;
  entries: TaskActivity[];
  more: boolean;
  loading: boolean;
  loadOlder: () => Promise<void>;
  gaps?: readonly Gap[];
  loadGap?: (id: number) => Promise<void>;
  /** Completed task details already display the outcome outside the transcript. */
  showSummary?: boolean;
};
type Row =
  | { id: string; kind: "prompt" | "older" | "summary" }
  | { id: string; kind: "gap"; gap: Gap }
  | { id: string; kind: "activity"; entry: TaskActivity };
const noGaps: readonly Gap[] = [];

function isToolRow(row: Row | undefined) {
  return row?.kind === "activity" && row.entry.kind === "tool";
}

/** Live work with no streaming text or running tool shows a quiet working line. */
function showsWorking(task: AgentTask, entries: TaskActivity[]) {
  if (task.status !== "running") return false;
  return !entries.some(
    (entry) =>
      (entry.kind === "message" && entry.status === "streaming") ||
      (entry.kind === "tool" && entry.status === "running"),
  );
}

function inputStatusLabel(status: Extract<TaskActivity, { kind: "input" }>["status"]) {
  if (status === "queued") return "inputQueued";
  if (status === "sent") return "inputSent";
  return status;
}

export function Conversation(props: Props) {
  return <ConversationViewport key={props.task.id} {...props} />;
}

function ConversationViewport({
  task,
  entries,
  more,
  loading,
  loadOlder,
  gaps = noGaps,
  loadGap,
  showSummary = true,
}: Props) {
  "use no memo"; // TanStack Virtual's mutable instance is consumed locally on each render.
  const t = useTranslations("tasks");
  const format = useFormatter();
  const viewport = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const anchor = useRef<{ id: string; offset: number } | undefined>(undefined);
  const anchorPadding = useRef(0);
  const [full, setFull] = useState(false);
  const tail = entries.reduce(
    (latest, entry) => (entry.kind === "usage" ? latest : `${entry.id}:${entry.revision}`),
    showSummary ? task.summary : "",
  );
  const [reading, setReading] = useState({ away: false, tail });
  const newOutput = reading.away && Boolean(tail) && reading.tail !== tail;
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const rows = useMemo(() => {
    const result: Row[] = [{ id: "history-start", kind: more ? "older" : "prompt" }];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      for (const gap of gaps)
        if (entry.order > gap.after && (entries[index - 1]?.order ?? 0) <= gap.after)
          result.push({ id: `gap:${gap.id}`, kind: "gap", gap });
      if (entry.kind !== "usage")
        result.push({ id: `activity:${entry.id}`, kind: "activity", entry });
    }
    if (showSummary && !entries.some((entry) => entry.kind === "message") && task.summary)
      result.push({ id: "summary", kind: "summary" });
    return result;
  }, [entries, gaps, more, task.summary, showSummary]);
  const getItemKey = useCallback((index: number) => rows[index]!.id, [rows]);
  const focusedIndex = focused ? rows.findIndex((row) => row.id === focused) : -1;
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = new Set(defaultRangeExtractor(range));
      if (focusedIndex >= 0) indexes.add(focusedIndex);
      return [...indexes].sort((a, b) => a - b);
    },
    [focusedIndex],
  );
  // oxlint-disable-next-line react/incompatible-library -- This component opts out of compiler memoization and consumes the mutable instance locally.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => viewport.current,
    getItemKey,
    estimateSize: () => 116,
    overscan: 6,
    rangeExtractor,
    useFlushSync: false,
    scrollPaddingStart: anchorPadding.current,
    // The initial estimate also gives prerendered and temporarily hidden regions content.
    initialRect: { width: 480, height: 480 },
  });
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) =>
    !full && !follow.current && item.start < (viewport.current?.scrollTop ?? 0);

  function rememberAnchor(content = false) {
    const node = viewport.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top + node.clientTop;
    const visible = [...node.querySelectorAll<HTMLElement>("[data-conversation-row]")].filter(
      (element) => element.getBoundingClientRect().bottom > top,
    );
    const first =
      (content
        ? visible.find((element) => element.dataset.conversationRow?.startsWith("activity:"))
        : undefined) ?? visible[0];
    if (first)
      anchor.current = {
        id: first.dataset.conversationRow!,
        offset: first.getBoundingClientRect().top - top,
      };
  }
  // Preserve a visible row, rather than total height: gap fills and revised Markdown
  // can change heights on both sides of the reader at the same time.
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (follow.current) {
      if (full) node.scrollTop = node.scrollHeight;
      else virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
    } else if (anchor.current) {
      const saved = anchor.current;
      const index = rows.findIndex((row) => row.id === saved.id);
      if (index >= 0) {
        if (full) {
          const element = [...node.querySelectorAll<HTMLElement>("[data-conversation-row]")].find(
            (row) => row.dataset.conversationRow === saved.id,
          );
          if (element) {
            node.scrollTop +=
              element.getBoundingClientRect().top -
              node.getBoundingClientRect().top -
              node.clientTop -
              saved.offset;
          }
        } else {
          const content = node.firstElementChild as HTMLElement;
          // An index target follows pending row measurements; an absolute
          // offset would discard corrections before its scroll event arrives.
          const contentStart =
            content.getBoundingClientRect().top -
            node.getBoundingClientRect().top -
            node.clientTop +
            node.scrollTop;
          anchorPadding.current = saved.offset - contentStart;
          virtualizer.setOptions({
            ...virtualizer.options,
            scrollPaddingStart: anchorPadding.current,
          });
          virtualizer.scrollToIndex(index, { align: "start" });
        }
      }
    }
  }, [rows, full, virtualizer]);
  // Measured Markdown can grow after a streaming update or a viewport resize.
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node && follow.current) {
      if (full) node.scrollTop = node.scrollHeight;
      else virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
    } else if (node && full && anchor.current) {
      const saved = anchor.current;
      const element = [...node.querySelectorAll<HTMLElement>("[data-conversation-row]")].find(
        (row) => row.dataset.conversationRow === saved.id,
      );
      if (element)
        node.scrollTop +=
          element.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          node.clientTop -
          saved.offset;
    }
  });

  const usage = entries.reduce(
    (total, entry) =>
      entry.kind === "usage"
        ? {
            input: total.input + entry.inputTokens,
            output: total.output + entry.outputTokens,
            cached: total.cached + entry.cachedInputTokens,
          }
        : total,
    { input: 0, output: 0, cached: 0 },
  );
  function renderRow(row: Row, index: number) {
    if (row.kind === "older" || row.kind === "gap") {
      const isGap = row.kind === "gap";
      const label = isGap ? "historyGap" : "olderMessages";
      return (
        <Button
          variant={isGap ? "outline" : "ghost"}
          size="sm"
          disabled={loading}
          onClick={async () => {
            follow.current = false;
            rememberAnchor(true);
            if (row.kind === "gap") await loadGap?.(row.gap.id);
            else await loadOlder();
          }}
        >
          {t(!isGap && loading ? "loadingHistory" : label)}
        </Button>
      );
    }
    if (row.kind === "prompt")
      return (
        <article className="rounded-xl bg-muted/60 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("you")}</p>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{task.prompt}</p>
        </article>
      );
    if (row.kind === "summary") return <TaskMarkdown>{task.summary}</TaskMarkdown>;
    if (row.kind !== "activity") return null;
    const entry = row.entry;
    if (entry.kind === "message")
      return (
        <article className="flex flex-col gap-2 py-1" aria-busy={entry.status === "streaming"}>
          <p className="text-xs font-medium text-muted-foreground">
            {agentProviderMetadata[task.provider].shortLabel}{" "}
            {entry.status !== "complete" && (
              <span>· {t(entry.status === "streaming" ? "streaming" : "interrupted")}</span>
            )}
          </p>
          <TaskMarkdown>{entry.text}</TaskMarkdown>
          {entry.truncated && (
            <p className="text-xs text-muted-foreground">{t("messageTruncated")}</p>
          )}
        </article>
      );
    if (entry.kind === "input")
      return (
        <article className="rounded-xl bg-muted/60 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("you")} · {t(entry.mode)} · {t(inputStatusLabel(entry.status))}
          </p>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.text}</p>
          {entry.code && <p className="mt-2 text-xs text-muted-foreground">{t(entry.code)}</p>}
        </article>
      );
    if (entry.kind === "tool")
      return (
        <ToolActivityRow
          entry={entry}
          first={!isToolRow(rows[index - 1])}
          last={!isToolRow(rows[index + 1])}
        />
      );
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("conversation")}</h3>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={full}
          onClick={() => {
            rememberAnchor();
            setFull(!full);
          }}
        >
          {t(full ? "virtualConversation" : "loadedFullText")}
        </Button>
      </div>
      {full && <p className="text-xs text-muted-foreground">{t("loadedConversationScope")}</p>}
      <div className="relative">
        <div
          ref={viewport}
          data-conversation
          data-conversation-mode={full ? "full" : "virtual"}
          className="relative max-h-[min(65vh,48rem)] min-h-48 overflow-auto overscroll-contain rounded-xl border border-border bg-background p-3 text-sm leading-[1.7] @min-[40rem]:p-4"
          style={{ overflowAnchor: "none" }}
          tabIndex={0}
          role="region"
          aria-label={t("conversation")}
          onScroll={() => {
            const node = viewport.current;
            if (node) {
              follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
              const following = follow.current;
              setReading((previous) =>
                previous.away === !following && (previous.away || previous.tail === tail)
                  ? previous
                  : { away: !following, tail: following ? tail : previous.tail },
              );
            }
            rememberAnchor();
          }}
          onFocusCapture={(event) =>
            setFocused(
              event.target.closest<HTMLElement>("[data-conversation-row]")?.dataset.conversationRow,
            )
          }
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(undefined);
          }}
        >
          <div
            className="relative"
            style={full ? undefined : { height: virtualizer.getTotalSize() }}
          >
            {(full
              ? rows.map((_, index) => ({ index, key: rows[index]!.id, start: 0 }))
              : virtualizer.getVirtualItems()
            ).map((item) => {
              const row = rows[item.index]!;
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  data-conversation-row={row.id}
                  className={cn(
                    !full && "absolute top-0 left-0 w-full",
                    isToolRow(row) && isToolRow(rows[item.index + 1]) ? "pb-0" : "pb-5",
                  )}
                  style={full ? undefined : { transform: `translateY(${item.start}px)` }}
                >
                  {renderRow(row, item.index)}
                </div>
              );
            })}
          </div>
        </div>
        {reading.away && (
          <div className="absolute right-3 bottom-3">
            {newOutput && (
              <span role="status" className="sr-only">
                {t("newOutput")}
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                follow.current = true;
                anchor.current = undefined;
                anchorPadding.current = 0;
                setReading({ away: false, tail });
                const node = viewport.current;
                if (node) {
                  if (full) node.scrollTop = node.scrollHeight;
                  else virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
                  node.focus({ preventScroll: true });
                }
              }}
            >
              <ChevronDownIcon aria-hidden="true" />
              {t(newOutput ? "newOutput" : "backToLatest")}
            </Button>
          </div>
        )}
      </div>
      {showsWorking(task, entries) && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
          />
          <ShimmerText active>
            {t("agentWorking", { agent: agentProviderMetadata[task.provider].shortLabel })}
          </ShimmerText>
        </p>
      )}
      {entries.some((entry) => entry.kind === "usage" && entry.known === false) ? (
        <p className="text-xs text-muted-foreground">{t("usageUnknown")}</p>
      ) : (
        (usage.input > 0 || usage.output > 0) && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {t("tokenUsage", {
              input: format.number(usage.input),
              output: format.number(usage.output),
              cached: format.number(usage.cached),
            })}
          </p>
        )
      )}
    </section>
  );
}
