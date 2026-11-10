import type { AgentTask } from "@raypx/core/tasks";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { CheckIcon } from "@raypx/icons/check";
import { Badge } from "@raypx/ui/components/ui/badge";
import { cn } from "@raypx/ui/lib/utils";

type TaskStatus = AgentTask["status"];
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type Indicator = "live" | "attention" | "done" | "problem" | "idle" | "none";

const failedStatuses: ReadonlySet<TaskStatus> = new Set([
  "failed",
  "interrupted",
  "delivery_failed",
]);

function statusVariant(status: TaskStatus): BadgeVariant {
  if (status === "waiting") return "default";
  if (failedStatuses.has(status)) return "destructive";
  if (status === "pending") return "outline";
  return "secondary";
}

function statusIndicator(status: TaskStatus): Indicator {
  if (status === "running" || status === "cancelling") return "live";
  if (status === "waiting") return "attention";
  if (status === "succeeded") return "done";
  if (failedStatuses.has(status)) return "problem";
  if (status === "pending") return "idle";
  return "none";
}

function StatusIndicator({ kind }: { kind: Indicator }) {
  if (kind === "done") return <CheckIcon aria-hidden="true" data-icon="inline-start" />;
  if (kind === "problem") return <AlertCircleIcon aria-hidden="true" data-icon="inline-start" />;
  if (kind === "none") return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        kind === "idle" ? "border border-current" : "bg-current",
        kind === "live" && "motion-safe:animate-pulse",
      )}
    />
  );
}

/**
 * One status vocabulary for session lists, details and approvals. Each state pairs its
 * label with a shape (live dot, attention dot, check, alert) so it never relies on color;
 * live states pulse only while they are actually running.
 */
export function TaskStatusBadge({
  status,
  label,
  className,
}: {
  status: TaskStatus;
  label: string;
  className?: string;
}) {
  return (
    <Badge variant={statusVariant(status)} className={cn("shrink-0 gap-1.5", className)}>
      <StatusIndicator kind={statusIndicator(status)} />
      {label}
    </Badge>
  );
}

/**
 * The compact form for dense navigation: only states that ask for a look (running,
 * waiting, failed) show a mark, and each carries its label for assistive technology.
 */
export function TaskStatusMark({ status, label }: { status: TaskStatus; label: string }) {
  const kind = statusIndicator(status);
  if (kind !== "live" && kind !== "attention" && kind !== "problem") return null;
  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center",
        kind === "problem" ? "text-destructive-text" : "text-foreground",
      )}
    >
      <StatusIndicator kind={kind} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
