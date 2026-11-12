import { useEffect, useState } from "react";
import type { TaskActivity } from "@raypx/core/tasks";
import type { IconComponent } from "@raypx/icons";
import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { FileEditIcon } from "@raypx/icons/file-edit";
import { FileTextIcon } from "@raypx/icons/file-text";
import { GlobalIcon } from "@raypx/icons/global";
import { SearchIcon } from "@raypx/icons/search";
import { TerminalIcon } from "@raypx/icons/terminal";
import { useFormatter } from "@raypx/i18n/browser";
import { StatusBadge, type StatusTone } from "@raypx/ui/status-badge";
import { cn } from "@raypx/ui/lib/utils";
import { formatDuration } from "./format-duration.js";
import { ShimmerText } from "./shimmer-text.js";
import { useTaskStatusLabel } from "./task-status.js";

type ToolActivity = Extract<TaskActivity, { kind: "tool" }>;

const toolTones: Record<ToolActivity["status"], StatusTone> = {
  running: "info",
  succeeded: "success",
  failed: "danger",
  interrupted: "warning",
};

type ToolIntent = "edit" | "read" | "shell" | "search" | "web" | "other";

/** Names differ between agents, so match on intent words rather than exact tool ids. */
const toolIntents: readonly { pattern: RegExp; intent: ToolIntent }[] = [
  { pattern: /edit|write|patch|replace|create/i, intent: "edit" },
  { pattern: /read|view|open|cat\b/i, intent: "read" },
  { pattern: /bash|shell|exec|command|terminal|run/i, intent: "shell" },
  { pattern: /grep|glob|search|find|list|ls\b/i, intent: "search" },
  { pattern: /web|fetch|http|browse|url/i, intent: "web" },
];

const intentIcons: Record<ToolIntent, IconComponent> = {
  edit: FileEditIcon,
  read: FileTextIcon,
  shell: TerminalIcon,
  search: SearchIcon,
  web: GlobalIcon,
  other: CodeFolderIcon,
};

function toolIntent(name: string): ToolIntent {
  return toolIntents.find(({ pattern }) => pattern.test(name))?.intent ?? "other";
}

function ToolIcon({ name }: { name: string }) {
  const Icon = intentIcons[toolIntent(name)];
  return <Icon className="size-3.5" />;
}

function elapsedSeconds(from: string, to: number) {
  return Math.max(0, (to - new Date(from).getTime()) / 1000);
}

/** Re-renders once a second while `active`, for a live elapsed time. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * One tool call in the conversation: an intent icon, the tool name (shimmering while it
 * runs), its live or final duration, its status label and the time it last changed.
 */
export function ToolActivityRow({
  entry,
  first,
  last,
}: {
  entry: ToolActivity;
  first: boolean;
  last: boolean;
}) {
  const taskStatus = useTaskStatusLabel();
  const format = useFormatter();
  const running = entry.status === "running";
  const now = useNow(running);
  const seconds = running
    ? elapsedSeconds(entry.createdAt, now)
    : elapsedSeconds(entry.createdAt, new Date(entry.updatedAt).getTime());
  return (
    <div
      aria-busy={running}
      data-first={first}
      data-last={last}
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-x border-border bg-muted/30 px-3 py-2.5 text-xs data-[first=true]:rounded-t-lg data-[first=true]:border-t data-[last=true]:rounded-b-lg data-[last=true]:border-b"
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground",
          running && "text-foreground",
        )}
      >
        <ToolIcon name={entry.name} />
      </span>
      <span className="min-w-0 flex-1 font-mono wrap-anywhere">
        <ShimmerText active={running}>{entry.name}</ShimmerText>
      </span>
      {(running || seconds >= 0.1) && (
        <span className="text-muted-foreground tabular-nums">
          {formatDuration(format, seconds)}
        </span>
      )}
      <StatusBadge tone={toolTones[entry.status]} label={taskStatus(entry.status)} />
      <time dateTime={entry.updatedAt} className="text-muted-foreground tabular-nums">
        {format.dateTime(new Date(entry.updatedAt), { hour: "2-digit", minute: "2-digit" })}
      </time>
    </div>
  );
}
