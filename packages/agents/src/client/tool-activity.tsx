import type { ToolActivity as ToolCallActivity } from "@raypx/core/conversation";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import {
  automaticApprovalState,
  approvalForToolCall,
  type ApprovalCardView,
  type ApprovalPort,
  type ConversationSelection,
} from "../model.js";
import { toolOperationLabel, openApiOperationKind } from "../model/tool-label.js";
import { EffectRecords } from "./effects.js";
import { useTranslations } from "./i18n.js";

const interactionCodes = {
  AGENT_MESSAGE_CROSS_SPACE_DISABLED: "AGENT_MESSAGE_CROSS_SPACE_DISABLED",
  AGENT_MESSAGE_CROSS_SPACE_UNSUPPORTED: "AGENT_MESSAGE_CROSS_SPACE_UNSUPPORTED",
  AGENT_MESSAGE_TARGET_INVALID: "AGENT_MESSAGE_TARGET_INVALID",
  AGENT_MESSAGE_DEPTH_LIMIT: "AGENT_MESSAGE_DEPTH_LIMIT",
  AGENT_MESSAGE_BUDGET_LIMIT: "AGENT_MESSAGE_BUDGET_LIMIT",
  DELEGATION_DEPTH_LIMIT: "DELEGATION_DEPTH_LIMIT",
  DELEGATION_CONCURRENT_LIMIT: "DELEGATION_CONCURRENT_LIMIT",
  DELEGATION_TOTAL_LIMIT: "DELEGATION_TOTAL_LIMIT",
  AGENT_TARGET_UNAVAILABLE: "AGENT_TARGET_UNAVAILABLE",
} as const;

function interactionCode(call: ToolCallActivity) {
  if (call.outcome !== "refused") return undefined;
  if (Object.hasOwn(interactionCodes, call.argumentSummary))
    return interactionCodes[call.argumentSummary as keyof typeof interactionCodes];
  if (Object.hasOwn(interactionCodes, call.target))
    return interactionCodes[call.target as keyof typeof interactionCodes];
  return undefined;
}

function ToolActivityRow({
  call,
  approvalPort,
  selection,
  answer,
  memberName,
  onOpenPage,
}: {
  call: ToolCallActivity;
  onOpenPage?: ((id: string) => void) | undefined;
  answer?: ApprovalCardView | undefined;
  memberName?: ((id: string) => string) | undefined;
  approvalPort?: ApprovalPort | undefined;
  selection?: ConversationSelection | undefined;
}) {
  const t = useTranslations("agents");
  const toolName = toolOperationLabel(call, t);
  const operationKind = openApiOperationKind(call);
  const refusal = interactionCode(call);
  const automatic = answer ? automaticApprovalState(answer) : null;
  const pageTool =
    call.toolName === "agent_page_create" ||
    call.toolName === "agent_page_update" ||
    call.toolName === "agent_page_read";
  // Only server-produced identity is a selector; target remains display text.
  const canOpenPage = pageTool && onOpenPage;
  return (
    <li
      data-message-row={`tool:${call.runId}:${call.toolCallId}`}
      data-tool-call={call.toolCallId}
      data-tool-outcome={call.outcome ?? "running"}
      className="flex min-w-0 flex-col gap-1 border-l pl-3 text-xs"
    >
      {canOpenPage ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto justify-start self-start p-0 text-xs"
          onClick={() => onOpenPage?.(call.page?.id ?? "")}
        >
          {toolName}
        </Button>
      ) : (
        <span className="min-w-0 font-medium wrap-anywhere">{toolName}</span>
      )}
      {operationKind && (
        <span data-openapi-operation-kind={operationKind} className="text-muted-foreground">
          {t(`openapi.${operationKind}`)}
        </span>
      )}
      <span className="min-w-0 font-mono text-muted-foreground wrap-anywhere">
        {call.target.slice(0, 1_024)}
      </span>
      <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-muted-foreground">
        <span>{refusal ? t(refusal) : t(`activity.outcomes.${call.outcome ?? "running"}`)}</span>
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
      {automatic && (
        <div
          data-auto-review={automatic}
          className="flex min-w-0 flex-col gap-1 text-muted-foreground"
        >
          <span>{t(`approval.automatic.${automatic}`)}</span>
          <span className="whitespace-pre-wrap wrap-anywhere">{answer?.review?.reason}</span>
        </div>
      )}
      {answer?.answeredByAccountId &&
        memberName &&
        (answer.state === "approved" || answer.state === "denied") && (
          <span className="text-muted-foreground">
            {t(
              answer.state === "approved" ? "spaceSettings.approvedBy" : "spaceSettings.deniedBy",
              { name: memberName(answer.answeredByAccountId) },
            )}
          </span>
        )}
      {(call.outcome === "unknown" || call.toolName.startsWith("openapi_")) &&
        approvalPort &&
        selection && (
          <EffectRecords
            port={approvalPort}
            selection={selection}
            runId={call.runId}
            activity={[call]}
          />
        )}
    </li>
  );
}

export function ToolActivity({
  activity,
  runId,
  pendingCount = 0,
  answers,
  memberName,
  approvalPort,
  selection,
  onOpenPage,
}: {
  onOpenPage?: ((id: string) => void) | undefined;
  activity: readonly ToolCallActivity[];
  runId: string;
  pendingCount?: number;
  answers?: readonly ApprovalCardView[] | undefined;
  memberName?: ((id: string) => string) | undefined;
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
  const effectsRun = activity.find(
    (call) => call.outcome === "unknown" || call.toolName.startsWith("openapi_"),
  )?.runId;
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
              <ToolActivityRow
                key={JSON.stringify([call.runId, call.toolCallId])}
                call={call}
                answer={approvalForToolCall(answers ?? [], call)}
                memberName={memberName}
                onOpenPage={onOpenPage}
              />
            ))}
          </ul>
          {effectsRun && approvalPort && selection && (
            <EffectRecords
              port={approvalPort}
              selection={selection}
              runId={effectsRun}
              activity={activity}
            />
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
