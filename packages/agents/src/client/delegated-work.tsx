import type { ToolActivity as ToolCallActivity } from "@raypx/core/conversation";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import type { ApprovalCardView, ApprovalPort, ConversationSelection, RunView } from "../model.js";
import { useTranslations } from "./i18n.js";
import { ToolActivity } from "./tool-activity.js";

export interface DelegatedWorkItem {
  run: RunView;
  task: string;
  activity: readonly ToolCallActivity[];
}

/** Child output stays under its parent; approval cards remain in the conversation. */
export function DelegatedWork({
  work,
  parentRunId,
  agentName,
  approvalPort,
  selection,
  answers,
  memberName,
}: {
  work: readonly DelegatedWorkItem[];
  parentRunId: string;
  agentName?: ((id: string | undefined) => string | undefined) | undefined;
  approvalPort?: ApprovalPort | undefined;
  selection?: ConversationSelection | undefined;
  answers?: readonly ApprovalCardView[] | undefined;
  memberName?: ((id: string) => string) | undefined;
}) {
  const t = useTranslations("agents");
  if (work.length === 0) return null;
  return (
    <Collapsible data-delegated-work={parentRunId} className="min-w-0">
      <CollapsibleTrigger render={<Button size="sm" variant="ghost" className="max-w-full" />}>
        <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {t("delegation.title", { count: String(work.length) })}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent animated>
        <ul className="flex min-w-0 flex-col gap-3 py-2 pl-3">
          {work.map(({ run, task, activity }) => {
            const name = agentName?.(run.agentId);
            const pending =
              answers?.filter((card) => card.runId === run.id && card.state === "pending").length ??
              0;
            return (
              <li
                key={run.id}
                data-child-run-id={run.id}
                data-child-state={run.state}
                className="flex min-w-0 flex-col gap-1 border-l pl-3 text-xs"
              >
                <span className="min-w-0 font-medium whitespace-pre-wrap wrap-anywhere">
                  {task.slice(0, 240) || t("delegation.task")}
                </span>
                {name && <span className="min-w-0 wrap-anywhere">{name}</span>}
                <span className="text-muted-foreground">{t(`delegation.states.${run.state}`)}</span>
                {run.failureCode && (
                  <span className="text-muted-foreground wrap-anywhere">{t(run.failureCode)}</span>
                )}
                <ToolActivity
                  runId={run.id}
                  activity={activity}
                  pendingCount={pending}
                  approvalPort={approvalPort}
                  selection={selection}
                  answers={answers}
                  memberName={memberName}
                />
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
