import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import type { ApprovalCardView } from "../model.js";
import { toolLabelKeys } from "./approval-card.js";
import { useTranslations } from "./i18n.js";

/** These events establish request states, never execution success. */
export function ToolActivity({
  cards,
  runId,
  accountId,
}: {
  cards: readonly ApprovalCardView[];
  runId: string;
  accountId: string;
}) {
  const t = useTranslations("agents");
  if (!cards.length) return null;
  return (
    <Collapsible data-tool-activity={runId} className="min-w-0">
      <CollapsibleTrigger render={<Button size="sm" variant="ghost" className="max-w-full" />}>
        <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
        <span className="min-w-0 truncate">{t("activity.requests", { count: cards.length })}</span>
      </CollapsibleTrigger>
      <CollapsibleContent animated>
        <ul aria-label={t("activity.title")} className="flex min-w-0 flex-col gap-2 py-2">
          {cards.map((card) => (
            <li
              key={card.requestId}
              data-message-row={`approval:${card.requestId}`}
              className="flex min-w-0 flex-col gap-1 border-l pl-3 text-xs"
            >
              <span className="min-w-0 font-medium wrap-anywhere">
                {t(toolLabelKeys[card.toolName])}
              </span>
              <span className="min-w-0 font-mono text-muted-foreground wrap-anywhere">
                {card.target.slice(0, 1024)}
              </span>
              <span className="text-muted-foreground">{t(`approval.states.${card.state}`)}</span>
              {card.answeredByAccountId && (
                <span className="text-muted-foreground">
                  {t("approval.answeredBy", {
                    member:
                      card.answeredByAccountId === accountId ? t("you") : card.answeredByAccountId,
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ComputerActivity({ cards }: { cards: readonly ApprovalCardView[] }) {
  const t = useTranslations("agents");
  const latest = [...cards]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 20);
  return (
    <section aria-label={t("activity.title")} className="flex min-w-0 flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{t("activity.title")}</h3>
      {!latest.length && <p className="text-xs text-muted-foreground">{t("activity.empty")}</p>}
      <ul className="flex min-w-0 flex-col gap-3">
        {latest.map((card) => (
          <li key={card.requestId} className="flex min-w-0 flex-col gap-1 text-xs">
            <span className="font-medium wrap-anywhere">{t(toolLabelKeys[card.toolName])}</span>
            <span className="font-mono text-muted-foreground wrap-anywhere">
              {card.target.slice(0, 1024)}
            </span>
            <span className="text-muted-foreground">{t(`approval.states.${card.state}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
