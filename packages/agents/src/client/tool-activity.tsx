import type { ToolActivity as ToolCallActivity } from "@raypx/core/conversation";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import type { ApprovalPort, ConversationSelection } from "../model.js";
import { toolLabelKeys } from "./approval-card.js";
import { EffectRecords } from "./effects.js";
import { useTranslations } from "./i18n.js";

function ToolActivityRow({
  call,
  approvalPort,
  selection,
}: {
  call: ToolCallActivity;
  approvalPort?: ApprovalPort | undefined;
  selection?: ConversationSelection | undefined;
}) {
  const t = useTranslations("agents");
  const toolName = Object.hasOwn(toolLabelKeys, call.toolName)
    ? t(toolLabelKeys[call.toolName as keyof typeof toolLabelKeys])
    : call.toolName.replaceAll("_", " ");
  return (
    <li
      data-message-row={`tool:${call.runId}:${call.toolCallId}`}
      data-tool-call={call.toolCallId}
      data-tool-outcome={call.outcome ?? "running"}
      className="flex min-w-0 flex-col gap-1 border-l pl-3 text-xs"
    >
      <span className="min-w-0 font-medium wrap-anywhere">{toolName}</span>
      <span className="min-w-0 font-mono text-muted-foreground wrap-anywhere">
        {call.target.slice(0, 1_024)}
      </span>
      <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-muted-foreground">
        <span>{t(`activity.outcomes.${call.outcome ?? "running"}`)}</span>
        {call.durationMs !== null && (
          <span className="tabular-nums">
            {t("activity.duration", { seconds: (call.durationMs / 1_000).toFixed(1) })}
          </span>
        )}
        {call.toolName === "computer_run_command" &&
          call.outcome === "failed" &&
          call.exitStatus !== null && (
            <span className="tabular-nums">
              {t("activity.exitStatus", { status: String(call.exitStatus) })}
            </span>
          )}
      </span>
      {call.outcome === "unknown" && approvalPort && selection && (
        <EffectRecords port={approvalPort} selection={selection} runId={call.runId} />
      )}
    </li>
  );
}

export function ToolActivity({
  activity,
  runId,
  pendingCount = 0,
  approvalPort,
  selection,
}: {
  activity: readonly ToolCallActivity[];
  runId: string;
  pendingCount?: number;
  approvalPort?: ApprovalPort | undefined;
  selection?: ConversationSelection | undefined;
}) {
  const t = useTranslations("agents");
  const count = activity.length + pendingCount;
  if (!count) return null;
  const failed = activity.filter(
    (call) => call.outcome === "failed" || call.outcome === "refused",
  ).length;
  const unknown = activity.some((call) => call.outcome === "unknown");
  const running = activity.some((call) => call.outcome === null);
  const unknownRun = activity.find((call) => call.outcome === "unknown")?.runId;
  let status = "";
  if (running) status = t("activity.outcomes.running");
  if (failed) status = t("activity.failedCount", { count: failed });
  if (unknown) status = t("activity.outcomes.unknown");
  if (pendingCount) status = t("approval.states.pending");
  return (
    <Collapsible data-tool-activity={runId} className="min-w-0">
      <CollapsibleTrigger render={<Button size="sm" variant="ghost" className="max-w-full" />}>
        <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
        <span className="min-w-0 truncate">{t("activity.used", { count })}</span>
        {status && <span className="min-w-0 truncate text-xs text-muted-foreground">{status}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent animated>
        <div className="flex min-w-0 flex-col gap-2 py-2">
          <ul aria-label={t("activity.title")} className="flex min-w-0 flex-col gap-2">
            {activity.map((call) => (
              <ToolActivityRow key={JSON.stringify([call.runId, call.toolCallId])} call={call} />
            ))}
          </ul>
          {unknownRun && approvalPort && selection && (
            <EffectRecords port={approvalPort} selection={selection} runId={unknownRun} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ComputerActivity({
  activity,
  approvalPort,
  selection,
}: {
  activity: readonly ToolCallActivity[];
  approvalPort?: ApprovalPort | undefined;
  selection?: ConversationSelection | undefined;
}) {
  const t = useTranslations("agents");
  const latest = [...activity]
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, 20);
  return (
    <section aria-label={t("activity.title")} className="flex min-w-0 flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{t("activity.title")}</h3>
      {!latest.length && <p className="text-xs text-muted-foreground">{t("activity.empty")}</p>}
      <ul className="flex min-w-0 flex-col gap-3">
        {latest.map((call) => (
          <ToolActivityRow
            key={JSON.stringify([call.runId, call.toolCallId])}
            call={call}
            approvalPort={approvalPort}
            selection={selection}
          />
        ))}
      </ul>
    </section>
  );
}
