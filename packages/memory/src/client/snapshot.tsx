import type { TaskContextSnapshot } from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
export function ContextSnapshot({ snapshot }: { snapshot: TaskContextSnapshot }) {
  const t = useTranslations("memory");
  if (!snapshot.sources.length) return null;
  return (
    <section aria-label={t("snapshot")} className="space-y-3 border-b border-border pb-5">
      <h3 className="text-sm font-medium">{t("snapshot")}</h3>
      <p className="max-w-[70ch] text-xs text-muted-foreground">{t("snapshotHint")}</p>
      {snapshot.sources.map((source) => (
        <Collapsible key={source.id}>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="group h-auto w-full justify-start gap-2 px-0 text-left whitespace-normal"
              />
            }
          >
            <ChevronRight aria-hidden="true" className="shrink-0 group-data-panel-open:rotate-90" />
            <span className="min-w-0 wrap-anywhere">{source.name}</span>
            <span className="text-xs text-muted-foreground">
              {t(source.kind)} · {t("revision", { revision: String(source.revision) })} ·{" "}
              {t(source.scope)}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-anywhere">
              {source.content}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ))}
      <time className="text-xs text-muted-foreground" dateTime={snapshot.capturedAt}>
        {t("capturedAt", { date: new Date(snapshot.capturedAt).toLocaleString() })}
      </time>
    </section>
  );
}
