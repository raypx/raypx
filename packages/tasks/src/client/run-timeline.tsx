import type { ReactNode } from "react";
import type { IconComponent } from "@raypx/icons";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { InfoIcon } from "@raypx/icons/info";
import { PauseIcon } from "@raypx/icons/pause";
import { PlayIcon } from "@raypx/icons/play";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { StopIcon } from "@raypx/icons/stop";
import { TaskListIcon } from "@raypx/icons/task-list";
import { TerminalIcon } from "@raypx/icons/terminal";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Badge } from "@raypx/ui/components/ui/badge";
import { cn } from "@raypx/ui/lib/utils";
import type { RunStep } from "../model/run-steps.ts";
import { formatDuration } from "./format-duration.ts";
import { ShimmerText } from "./shimmer-text.tsx";

type Tone = "current" | "done" | "attention" | "problem";
type StatusStep = Extract<RunStep, { kind: "status" }>;
type RequestStep = Extract<RunStep, { kind: "request" }>;

const failedStatuses: ReadonlySet<StatusStep["status"]> = new Set([
  "failed",
  "interrupted",
  "delivery_failed",
]);

const statusIcons: Record<StatusStep["status"], IconComponent | null> = {
  pending: null,
  running: PlayIcon,
  waiting: PauseIcon,
  cancelling: StopIcon,
  cancelled: StopIcon,
  succeeded: CheckCircleIcon,
  failed: AlertCircleIcon,
  interrupted: AlertCircleIcon,
  delivery_failed: AlertCircleIcon,
};

const requestIcons: Record<RequestStep["requestKind"], IconComponent> = {
  permission: ShieldCheckIcon,
  question: InfoIcon,
  plan: TaskListIcon,
};

const toneClass: Record<Tone, string> = {
  current: "text-foreground",
  done: "text-muted-foreground",
  attention: "text-foreground",
  problem: "text-destructive-text",
};

function stepTone(step: RunStep, current: boolean): Tone {
  if (step.kind === "status" && failedStatuses.has(step.status)) return "problem";
  if (step.kind === "tools" && step.failed > 0 && !current) return "problem";
  if (step.kind === "request" && step.status === "pending") return "attention";
  return current ? "current" : "done";
}

function StepGlyph({ step, current }: { step: RunStep; current: boolean }) {
  const live = current && (step.kind === "tools" ? step.running > 0 : step.kind === "status");
  if (live && (step.kind !== "status" || step.status === "running")) {
    return <SpinnerIcon className="size-4 motion-safe:animate-spin" />;
  }
  if (step.kind === "request") {
    const Icon = requestIcons[step.requestKind];
    return <Icon className="size-4" />;
  }
  if (step.kind === "tools") return <TerminalIcon className="size-4" />;
  const Icon = statusIcons[step.status];
  if (!Icon) return <span className="size-3.5 rounded-full border border-dashed border-current" />;
  return <Icon className="size-4" />;
}

function requestBadge(status: RequestStep["status"]) {
  if (status === "pending") return { variant: "default", label: "needsYou" } as const;
  if (status === "expired" || status === "cancelled")
    return { variant: "outline", label: status } as const;
  return { variant: "secondary", label: status } as const;
}

/**
 * The run as one column: a glyph spine, step labels and a right-hand duration column.
 * Finished steps recede, the step in flight carries a band and human requests show
 * their current status, so the run reads top to bottom without opening each event.
 */
export function RunTimeline({ steps, live }: { steps: readonly RunStep[]; live: boolean }) {
  const t = useTranslations("tasks");
  const format = useFormatter();

  function label(step: RunStep, current: boolean): ReactNode {
    if (step.kind === "status") return t(step.status);
    if (step.kind === "request") return step.title || t(step.requestKind);
    const text = t("toolCalls", { count: step.count });
    return <ShimmerText active={current && step.running > 0}>{text}</ShimmerText>;
  }

  function aside(step: RunStep) {
    if (step.kind === "request") {
      const badge = requestBadge(step.status);
      return <Badge variant={badge.variant}>{t(badge.label)}</Badge>;
    }
    if (step.kind !== "tools") return null;
    return (
      <>
        {step.failed > 0 && (
          <Badge variant="destructive">{t("toolFailures", { count: String(step.failed) })}</Badge>
        )}
        {step.seconds >= 0.1 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(format, step.seconds)}
          </span>
        )}
      </>
    );
  }

  if (!steps.length) return <p className="mt-3 text-xs text-muted-foreground">{t("noActivity")}</p>;
  return (
    <ol className="mt-3 flex flex-col">
      {steps.map((step, index) => {
        const current = live && index === steps.length - 1;
        const tone = stepTone(step, current);
        return (
          <li
            key={step.key}
            aria-current={current ? "step" : undefined}
            className={cn(
              "relative flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-sm",
              current && "bg-muted/60",
            )}
          >
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-7 -bottom-1.5 left-[1.0625rem] w-px bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn("grid size-5 shrink-0 place-items-center", toneClass[tone])}
            >
              <StepGlyph step={step} current={current} />
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 wrap-anywhere",
                tone === "done" && "text-muted-foreground",
                tone === "problem" && "text-destructive-text",
              )}
            >
              {label(step, current)}
            </span>
            <span className="flex shrink-0 items-center gap-2">{aside(step)}</span>
          </li>
        );
      })}
    </ol>
  );
}
