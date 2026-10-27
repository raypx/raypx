/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Bounded read-only scroll regions need keyboard focus for scrolling. */
import { Fragment, useLayoutEffect, useRef } from "react";
import type { AgentTask, TaskActivity } from "@raypx/contracts/tasks";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { TaskMarkdown } from "./markdown.js";

export function Conversation({
  task,
  entries,
  more,
  loading,
  loadOlder,
  gaps = [],
  loadGap,
}: {
  task: AgentTask;
  entries: TaskActivity[];
  more: boolean;
  loading: boolean;
  loadOlder: () => Promise<void>;
  gaps?: readonly { id: number; before: number; after: number }[];
  loadGap?: (id: number) => Promise<void>;
}) {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const viewport = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    olderHeight = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (olderHeight.current !== undefined) {
      node.scrollTop += node.scrollHeight - olderHeight.current;
      olderHeight.current = undefined;
    } else if (follow.current) node.scrollTop = node.scrollHeight;
  }, [entries]);
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
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{t("conversation")}</h3>
      <div
        ref={viewport}
        className="flex max-h-[min(65vh,48rem)] min-h-48 flex-col gap-5 overflow-auto overscroll-contain rounded-md border border-border p-4 text-sm leading-[1.7]"
        tabIndex={0}
        role="region"
        aria-label={t("conversation")}
        onScroll={() => {
          const node = viewport.current;
          if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
      >
        {more ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={async () => {
              follow.current = false;
              olderHeight.current = viewport.current?.scrollHeight;
              await loadOlder();
            }}
          >
            {t(loading ? "loadingHistory" : "olderMessages")}
          </Button>
        ) : (
          <article className="rounded-sm bg-muted px-4 py-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("you")}</p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{task.prompt}</p>
          </article>
        )}
        {entries.map((entry, index) => (
          <Fragment key={entry.id}>
            {gaps
              .filter(
                (gap) => entry.order > gap.after && (entries[index - 1]?.order ?? 0) <= gap.after,
              )
              .map((gap) => (
                <Button
                  key={gap.id}
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={async () => {
                    follow.current = false;
                    await loadGap?.(gap.id);
                  }}
                >
                  {t("historyGap")}
                </Button>
              ))}
            {entry.kind === "message" ? (
              <article
                key={entry.id}
                className="space-y-2 py-2"
                aria-busy={entry.status === "streaming"}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {task.provider === "claude" ? "Claude" : "Codex"}{" "}
                  {entry.status !== "complete" && (
                    <span>· {t(entry.status === "streaming" ? "streaming" : "interrupted")}</span>
                  )}
                </p>
                <TaskMarkdown>{entry.text}</TaskMarkdown>
                {entry.truncated && (
                  <p className="text-xs text-muted-foreground">{t("messageTruncated")}</p>
                )}
              </article>
            ) : entry.kind === "input" ? (
              <article key={entry.id} className="rounded-sm bg-muted px-4 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("you")} · {t(entry.mode)} ·{" "}
                  {t(
                    entry.status === "queued"
                      ? "inputQueued"
                      : entry.status === "sent"
                        ? "inputSent"
                        : entry.status,
                  )}
                </p>
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.text}</p>
                {entry.code && (
                  <p className="mt-2 text-xs text-muted-foreground">{t(entry.code)}</p>
                )}
              </article>
            ) : entry.kind === "tool" ? (
              <p
                key={entry.id}
                className="flex gap-2 border-l-2 border-border pl-3 font-mono text-xs text-muted-foreground"
              >
                <span className="font-medium text-foreground">{entry.name}</span>
                <span>{t(entry.status)}</span>
              </p>
            ) : null}
          </Fragment>
        ))}
        {!entries.some((entry) => entry.kind === "message") && task.summary && (
          <TaskMarkdown>{task.summary}</TaskMarkdown>
        )}
      </div>
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
