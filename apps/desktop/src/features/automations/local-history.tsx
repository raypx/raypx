import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useTranslations } from "@raypx/i18n/browser";
import type { JobDefinition, JobRun } from "@raypx/jobs/model";

/** Past runs of one job and the upcoming times its schedule resolves to. */
export function LocalJobHistory({
  history,
  date,
  onClose,
}: {
  history: { job: JobDefinition; runs: JobRun[] };
  date: (value: string) => string;
  onClose: () => void;
}) {
  const t = useTranslations("automations");
  const c = useTranslations("common");
  return (
    <section className="mt-8">
      <header className="flex items-center justify-between gap-4 border-b border-border py-3 pr-4">
        <h2 className="text-sm font-medium wrap-anywhere">
          {history.job.name} · {t("history")}
        </h2>
        <Button variant="ghost" onClick={onClose}>
          {c("close")}
        </Button>
      </header>
      {history.runs.length === 0 ? (
        <p className="text-muted-foreground">{t("noHistory")}</p>
      ) : (
        history.runs.map((jobRun) => (
          <Collapsible className="border-b border-border" key={jobRun.id}>
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  className="group h-auto w-full flex-wrap justify-start gap-4 rounded-none px-0 py-3"
                />
              }
            >
              <ChevronRightIcon
                aria-hidden="true"
                className="group-data-panel-open:rotate-90 motion-safe:transition-transform motion-safe:duration-200 group-focus-visible:transition-none"
              />
              <span className="text-xs tabular-nums">{date(jobRun.startedAt)}</span>
              <Badge variant={jobRun.status === "failed" ? "destructive" : "secondary"}>
                {c(jobRun.status)}
              </Badge>
              <span className="text-xs">
                {jobRun.exitCode !== null && `${t("local.exit")}: ${jobRun.exitCode}`}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent animated>
              <div className="pb-4 pl-6">
                {jobRun.output && (
                  <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs/relaxed whitespace-pre-wrap wrap-anywhere">
                    {jobRun.output}
                  </pre>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))
      )}
      {history.job.nextRuns.length > 0 && (
        <div className="mt-6 text-xs text-muted-foreground">
          <h3 className="text-sm font-medium text-foreground">{t("preview")}</h3>
          <ul className="mt-2 pl-4 leading-relaxed tabular-nums">
            {history.job.nextRuns.map((value) => (
              <li key={value}>{date(value)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
