import { useTranslations } from "./i18n.js";
import type { TaskContextSnapshot } from "@raypx/core/tasks";
import { useFormatter } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
export function ContextSnapshot({ snapshot }: { snapshot: TaskContextSnapshot }) {
  const t = useTranslations("memory");
  const common = useTranslations("common");
  const format = useFormatter();
  if (!snapshot.sources.length) return null;
  return (
    <section aria-label={t("snapshot")} className="space-y-2 border-b border-border pb-4">
      <h3 className="text-sm font-medium">{t("snapshot")}</h3>
      <p className="max-w-[70ch] text-xs text-muted-foreground">{t("snapshotHint")}</p>
      {snapshot.sources.map((source) => (
        <Collapsible key={source.id}>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="group h-auto w-full items-start justify-start gap-2 px-0 py-2 text-left whitespace-normal"
              />
            }
          >
            <ChevronRightIcon
              aria-hidden="true"
              className="mt-0.5 shrink-0 group-data-panel-open:rotate-90"
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="wrap-anywhere">{source.name}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {t(source.kind)} · {t("revision", { revision: String(source.revision) })} ·{" "}
                {source.scope === "account" ? common("account") : t("localScope")}
              </span>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
              {source.content}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ))}
      <time
        className="block text-xs text-muted-foreground tabular-nums"
        dateTime={snapshot.capturedAt}
      >
        {t("capturedAt", { date: format.dateTime(new Date(snapshot.capturedAt), "timestamp") })}
      </time>
    </section>
  );
}
