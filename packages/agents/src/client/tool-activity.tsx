import { cn } from "@raypx/ui/lib/utils";
import { statusStyle } from "./status-style.js";
import { useId, type ReactNode } from "react";
import type { ToolActivity as ToolCallActivity } from "@raypx/core/conversation";
import { Button } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
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
const toolRefusalKeys = {
  INVALID_TOOL: "activity.refusal.unavailable",
  INVALID_ARGUMENTS: "activity.refusal.invalidArguments",
  TOOL_ARGUMENTS_TRUNCATED: "activity.refusal.truncatedArguments",
  SECRET_INPUT: "activity.refusal.secretInput",
  SECRET_OUTPUT: "activity.refusal.secretOutput",
  COMPUTER_UNAVAILABLE: "activity.refusal.computerUnavailable",
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
  const rejectedCall = call.toolName === "refused_tool";
  let toolName = toolOperationLabel(call, t);
  if (rejectedCall)
    toolName =
      call.target === "unavailable"
        ? t("activity.refusal.tool")
        : toolOperationLabel({ toolName: call.target, argumentSummary: "" }, t);
  const rejectionKey = Object.hasOwn(toolRefusalKeys, call.argumentSummary)
    ? toolRefusalKeys[call.argumentSummary as keyof typeof toolRefusalKeys]
    : "activity.refusal.generic";
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
      className="relative flex min-w-0 flex-col gap-2 border-l border-border py-1 pl-4 text-xs before:absolute before:top-2.5 before:-left-1 before:size-2 before:rounded-full before:border before:border-border before:bg-background"
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
      {rejectedCall ? (
        <span className="text-muted-foreground">{t(rejectionKey)}</span>
      ) : (
        <span className="min-w-0 font-mono text-muted-foreground wrap-anywhere">
          {call.target.slice(0, 1_024)}
        </span>
      )}
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        <span className={statusStyle(call.outcome ?? "running")}>
          {refusal ? t(refusal) : t(`activity.outcomes.${call.outcome ?? "running"}`)}
        </span>
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
          <Badge variant="secondary" className="self-start whitespace-normal">
            {t(`approval.automatic.${automatic}`)}
          </Badge>
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
  children,
  additionalCount = 0,
  defaultExpanded = false,
  timeline = false,
  runStatus,
}: {
  onOpenPage?: ((id: string) => void) | undefined;
  activity: readonly ToolCallActivity[];
  runId: string;
  pendingCount?: number;
  answers?: readonly ApprovalCardView[] | undefined;
  memberName?: ((id: string) => string) | undefined;
  approvalPort?: ApprovalPort | undefined;
  selection?: ConversationSelection | undefined;
  children?: ReactNode;
  additionalCount?: number;
  defaultExpanded?: boolean;
  timeline?: boolean;
  runStatus?: string | undefined;
}) {
  const t = useTranslations("agents");
  const statusId = useId();
  const count = activity.length + pendingCount + additionalCount;
  if (!count) return null;
  const failed = activity.filter(
    (call) => call.outcome === "failed" || call.outcome === "refused",
  ).length;
  const unknown = activity.some((call) => call.outcome === "unknown");
  const running = activity.some((call) => call.outcome === null);
  const effectsRun = activity.find(
    (call) => call.outcome === "unknown" || call.toolName.startsWith("openapi_"),
  )?.runId;
  let role = "succeeded";
  if (running) role = "running";
  if (failed || unknown) role = "failed";
  if (pendingCount) role = "waiting";
  let status = "";
  if (running) status = t("activity.outcomes.running");
  if (failed) status = t("activity.failedCount", { count: failed });
  if (unknown) status = t("activity.outcomes.unknown");
  if (pendingCount) status = t("approval.states.pending");
  if (runStatus !== undefined) status = runStatus;
  return (
    <Collapsible
      defaultOpen={defaultExpanded}
      data-tool-activity={runId}
      className={cn("min-w-0", timeline && "border-t border-border/60 px-2 py-1.5 sm:px-3")}
    >
      <CollapsibleTrigger
        aria-label={t("activity.steps", { count })}
        aria-describedby={status ? statusId : undefined}
        render={
          <Button
            size="sm"
            variant="ghost"
            className={cn("max-w-full", timeline && "w-full justify-start")}
          />
        }
      >
        <ChevronDownIcon
          data-icon="inline-start"
          aria-hidden="true"
          className="group-aria-[expanded=false]/button:-rotate-90"
        />
        <span className="min-w-0 truncate">{t("activity.steps", { count })}</span>
        {status && (
          <span
            id={statusId}
            className={cn("min-w-0 truncate text-xs", timeline && "ml-auto", statusStyle(role))}
          >
            {status}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent animated>
        <div className={cn("flex min-w-0 flex-col gap-2 py-2", timeline && "px-3")}>
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
          {children}
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
