/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Bounded read-only scroll regions need keyboard focus for scrolling. */
import { useLayoutEffect, useRef } from "react";
import type { AgentTask, TaskActivity } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { TaskMarkdown } from "./markdown.js";

export function Conversation({
  task,
  entries,
  more,
  loading,
  loadOlder,
}: {
  task: AgentTask;
  entries: TaskActivity[];
  more: boolean;
  loading: boolean;
  loadOlder: () => Promise<void>;
}) {
  const t = useTranslations("tasks");
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
        className="task-conversation"
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
          <article className="task-user-message">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("you")}</p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{task.prompt}</p>
          </article>
        )}
        {entries.map((entry) =>
          entry.kind === "message" ? (
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
            <article key={entry.id} className="task-user-message">
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
              {entry.code && <p className="mt-2 text-xs text-muted-foreground">{t(entry.code)}</p>}
            </article>
          ) : entry.kind === "tool" ? (
            <p
              key={entry.id}
              className="flex gap-2 border-l-2 border-border pl-3 font-mono text-xs text-muted-foreground"
            >
              <span className="font-medium text-foreground">{entry.name}</span>
              <span>{t(entry.status)}</span>
            </p>
          ) : null,
        )}
        {!entries.some((entry) => entry.kind === "message") && task.summary && (
          <TaskMarkdown>{task.summary}</TaskMarkdown>
        )}
      </div>
      {(usage.input > 0 || usage.output > 0) && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("tokenUsage", {
            input: usage.input.toLocaleString(),
            output: usage.output.toLocaleString(),
            cached: usage.cached.toLocaleString(),
          })}
        </p>
      )}
    </section>
  );
}
